import type { DbHandle } from "@/lib/db";
import { getDb, tx } from "@/lib/db";
import { newId } from "@/lib/core/ids";
import { nowIso, hoursUntil, formatDateTime } from "@/lib/core/time";
import { errors } from "@/lib/core/errors";
import type { Currency } from "@/lib/core/money";
import { convert, formatMoney, percentOf } from "@/lib/core/money";
import { audit } from "./audit";
import { issueTicket } from "./tickets";
import { queueSms, flushSmsQueue } from "@/lib/sms";
import {
  companyPolicy,
  getBooking,
  getCompany,
  getTicket,
  getTrip,
  type ResaleListingRow,
  type TicketRow,
} from "./repo";
import type { CompanyPolicy as Policy } from "./types";

/** Commission de revente : 10 % du prix, plancher 1 USD (§2.6). */
export function resaleFee(
  priceAmount: number,
  currency: Currency,
  policy: Policy,
  usdToCdf: number,
): number {
  const percentage = percentOf(priceAmount, policy.resaleFeeRate);
  const floor = convert(policy.resaleFeeFloorUsd, "USD", currency, usdToCdf);
  // Le plancher protège la marge sur les axes courts : sur un billet à 5 USD,
  // 10 % ne couvrent pas les frais opérateur d'encaissement + décaissement.
  return Math.min(priceAmount, Math.max(percentage, floor));
}

export interface ResaleEligibility {
  eligible: boolean;
  raison?: string;
  fee?: number;
  netVendeur?: number;
  limite?: string;
}

/**
 * §2.6 Éligibilité : « billet émis, payé, départ à plus de 4 heures, passager
 * non embarqué ». Plus le garde-fou anti-revendeur et l'unicité de revente.
 */
export async function checkResaleEligibility(
  ticketId: string,
  db: DbHandle = getDb(),
): Promise<ResaleEligibility> {
  const ticket = await getTicket(ticketId, db);
  const trip = await getTrip(ticket.trip_id, db);
  const company = await getCompany(trip.company_id, db);
  const policy = companyPolicy(company);

  if (ticket.status === "EN_REVENTE") return { eligible: false, raison: "Ce billet est déjà en revente." };
  if (ticket.status !== "EMIS") {
    return { eligible: false, raison: `Statut ${ticket.status} : seul un billet émis se revend.` };
  }
  if (ticket.resold_count >= 1) {
    // « Un billet ne peut être revendu qu'une seule fois. »
    return { eligible: false, raison: "Ce billet a déjà été revendu une fois." };
  }
  const remaining = hoursUntil(trip.departure_datetime);
  if (remaining < policy.resaleDeadlineHours) {
    return {
      eligible: false,
      raison: `Départ dans moins de ${policy.resaleDeadlineHours} h : la revente est fermée.`,
    };
  }

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const count = await db
    .prepare<{ n: number }>(
      `SELECT COUNT(*) AS n FROM resale_listings
        WHERE seller_phone = ? AND listed_at >= ? AND status IN ('ACTIVE','VENDUE')`,
    )
    .get(ticket.passenger_phone, monthStart.toISOString());
  if ((count?.n ?? 0) >= policy.resaleMaxPerPhonePerMonth) {
    // « Bloque les revendeurs professionnels. »
    return {
      eligible: false,
      raison: `Limite de ${policy.resaleMaxPerPhonePerMonth} reventes par mois atteinte pour ce numéro.`,
    };
  }

  const fee = resaleFee(
    ticket.price_amount,
    ticket.price_currency as Currency,
    policy,
    company.currency_rate_usd_cdf,
  );
  return {
    eligible: true,
    fee,
    netVendeur: ticket.price_amount - fee,
    limite: new Date(
      new Date(trip.departure_datetime).getTime() - policy.resaleDeadlineHours * 3_600_000,
    ).toISOString(),
  };
}

/** §2.6 étape 1 : « Vendeur active "remettre en vente" → EMIS → EN_REVENTE ». */
export async function listForResale(params: {
  ticketId: string;
  actorPhone: string;
}): Promise<ResaleListingRow> {
  return tx(async (db) => {
    const ticket = await getTicket(params.ticketId, db);
    if (ticket.passenger_phone !== params.actorPhone) {
      throw errors.forbidden("Ce billet n'est pas au nom de ce numéro.");
    }
    const eligibility = await checkResaleEligibility(params.ticketId, db);
    if (!eligibility.eligible) throw errors.conflict("REVENTE_NON_ELIGIBLE", eligibility.raison!);

    const trip = await getTrip(ticket.trip_id, db);
    const policy = companyPolicy(await getCompany(trip.company_id, db));
    const expiresAt = new Date(
      new Date(trip.departure_datetime).getTime() - policy.resaleDeadlineHours * 3_600_000,
    ).toISOString();

    const id = newId("rsl");
    await db
      .prepare(
        `INSERT INTO resale_listings
         (id, ticket_id, trip_id, seller_phone, price_amount, price_currency,
          listed_at, expires_at, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')`,
      )
      .run(
        id,
        ticket.id,
        ticket.trip_id,
        ticket.passenger_phone,
        // « Le prix de revente est celui de l'achat original. Aucune fixation
        // libre du prix. » Le paramètre n'existe pas dans la signature.
        ticket.price_amount,
        ticket.price_currency,
        nowIso(),
        expiresAt,
      );

    await db
      .prepare(`UPDATE tickets SET status = 'EN_REVENTE', updated_at = ? WHERE id = ?`)
      .run(nowIso(), ticket.id);
    // Le siège reste VENDU : « Il ne retourne jamais au stock disponible.
    // C'est ce qui empêche la double vente. » (§2.6)

    await audit(
      {
        action: "MISE_EN_REVENTE",
        entity: "ticket",
        entityId: ticket.id,
        before: { status: "EMIS" },
        after: { status: "EN_REVENTE", listing: id, prix: ticket.price_amount },
      },
      db,
    );
    return (await db
      .prepare<ResaleListingRow>(`SELECT * FROM resale_listings WHERE id = ?`)
      .get(id)) as ResaleListingRow;
  });
}

/** Retrait volontaire : le billet redevient EMIS, son titulaire n'a rien perdu. */
export async function withdrawResale(ticketId: string, actorPhone: string): Promise<TicketRow> {
  return tx(async (db) => {
    const ticket = await getTicket(ticketId, db);
    if (ticket.passenger_phone !== actorPhone) throw errors.forbidden("Billet d'un autre numéro.");
    if (ticket.status !== "EN_REVENTE") {
      throw errors.conflict("BILLET_NON_EN_REVENTE", "Ce billet n'est pas en revente.");
    }
    await db
      .prepare(`UPDATE resale_listings SET status = 'RETIREE' WHERE ticket_id = ? AND status = 'ACTIVE'`)
      .run(ticketId);
    await db
      .prepare(`UPDATE tickets SET status = 'EMIS', updated_at = ? WHERE id = ?`)
      .run(nowIso(), ticketId);
    await audit({ action: "RETRAIT_REVENTE", entity: "ticket", entityId: ticketId }, db);
    return getTicket(ticketId, db);
  });
}

/**
 * §2.6 : « Aucun acheteur avant la limite : le billet redevient émis et reste
 * valide pour son titulaire d'origine. Il n'a rien perdu. »
 */
export async function expireStaleListings(db: DbHandle = getDb()): Promise<number> {
  const expired = await db
    .prepare<ResaleListingRow>(`SELECT * FROM resale_listings WHERE status = 'ACTIVE' AND expires_at <= ?`)
    .all(nowIso());
  for (const listing of expired) {
    await db.prepare(`UPDATE resale_listings SET status = 'EXPIREE' WHERE id = ?`).run(listing.id);
    await db
      .prepare(
        `UPDATE tickets SET status = 'EMIS', updated_at = ? WHERE id = ? AND status = 'EN_REVENTE'`,
      )
      .run(nowIso(), listing.ticket_id);
  }
  return expired.length;
}

export interface ResaleOffer {
  listing: ResaleListingRow;
  seatNumber: string;
}

/** Sièges remis en vente sur un trajet — badge « remis en vente » (§2.6). */
export async function activeListings(tripId: string, db: DbHandle = getDb()): Promise<ResaleOffer[]> {
  await expireStaleListings(db);
  const rows = await db
    .prepare<ResaleListingRow & { seatNumber: string }>(
      `SELECT l.*, s.seat_number AS seatNumber
         FROM resale_listings l
         JOIN tickets t ON t.id = l.ticket_id
         JOIN trip_seats s ON s.id = t.trip_seat_id
        WHERE l.trip_id = ? AND l.status = 'ACTIVE'
        ORDER BY s.seat_number`,
    )
    .all(tripId);
  return rows.map((row) => {
    const { seatNumber, ...listing } = row;
    return { listing, seatNumber };
  });
}

/**
 * §2.6 étape 4 : « ATOMIQUEMENT, une seule transaction : ancien ticket →
 * ANNULE_REVENDU (QR invalidé) ; nouveau ticket → EMIS ; remboursement vendeur
 * → mis en file. Échec partiel : tout est annulé. Un ancien QR encore valide
 * après revente, c'est un passager refusé à l'embarquement. »
 *
 * Le paiement de l'acheteur est déjà confirmé quand cette fonction s'exécute :
 * elle ne fait que basculer la propriété du siège.
 *
 * Concurrence MySQL : sous SQLite, le verrou d'écriture global de la
 * transaction IMMEDIATE empêchait deux acheteurs de passer en même temps sur
 * la même annonce. Sous MySQL, deux transactions concurrentes peuvent lire la
 * même annonce ACTIVE avant qu'aucune n'ait écrit. La lecture initiale de
 * l'annonce se fait donc désormais avec `FOR UPDATE` : un second acheteur qui
 * cible la même annonce attend que la première transaction se termine, puis
 * relit un statut à jour (déjà VENDUE) et échoue proprement au lieu de
 * dérouler tout le scénario avec des données périmées. La mise à jour finale
 * vers VENDUE re-vérifie en plus `status = 'ACTIVE'` et le nombre de lignes
 * affectées, en filet de sécurité indépendant du bon usage de FOR UPDATE.
 */
export async function completeResale(params: {
  listingId: string;
  buyerName: string;
  buyerPhone: string;
  /** Réservation de l'acheteur, déjà payée. */
  bookingId: string;
}): Promise<{ ancien: TicketRow; nouveau: TicketRow; commission: number; remboursementVendeur: number }> {
  const outcome = await tx(async (db) => {
    const listing = await db
      .prepare<ResaleListingRow>(`SELECT * FROM resale_listings WHERE id = ? FOR UPDATE`)
      .get(params.listingId);
    if (!listing) throw errors.notFound("Annonce de revente");
    // Deux acheteurs sur le même siège remis en vente : le second trouve
    // l'annonce déjà VENDUE et repart avec un remboursement (§5.2).
    if (listing.status !== "ACTIVE") {
      throw errors.conflict("ANNONCE_INDISPONIBLE", "Ce siège vient d'être vendu à un autre acheteur.");
    }

    const oldTicket = await getTicket(listing.ticket_id, db);
    if (oldTicket.status !== "EN_REVENTE") {
      throw errors.conflict("BILLET_NON_EN_REVENTE", "Le billet n'est plus en revente.");
    }

    const trip = await getTrip(listing.trip_id, db);
    const company = await getCompany(trip.company_id, db);
    const policy = companyPolicy(company);
    const seat = (await db
      .prepare<{ id: string; seat_number: string }>(
        `SELECT id, seat_number FROM trip_seats WHERE id = ?`,
      )
      .get(oldTicket.trip_seat_id)) as { id: string; seat_number: string };

    // a) Ancien billet invalidé — son QR ne vaut plus rien.
    await db
      .prepare(
        `UPDATE tickets SET status = 'ANNULE_REVENDU', resold_count = resold_count + 1, updated_at = ?
        WHERE id = ?`,
      )
      .run(nowIso(), oldTicket.id);

    // b) Nouveau billet, nouveau QR, nouveau titulaire. Le siège n'est jamais
    //    repassé par DISPONIBLE : issueTicket le laisse en VENDU.
    const newTicket = await issueTicket(db, {
      bookingId: params.bookingId,
      tripId: listing.trip_id,
      seat,
      passengerName: params.buyerName,
      passengerPhone: params.buyerPhone,
      priceAmount: listing.price_amount,
      priceCurrency: listing.price_currency as Currency,
      parentTicketId: oldTicket.id,
    });

    // c) Remboursement du vendeur mis en file : montant − commission.
    const fee = resaleFee(
      listing.price_amount,
      listing.price_currency as Currency,
      policy,
      company.currency_rate_usd_cdf,
    );
    const net = listing.price_amount - fee;

    const originalPayment = await db
      .prepare<{ provider: string; payer_phone: string }>(
        `SELECT provider, payer_phone FROM payments
          WHERE booking_id = ? AND status = 'CONFIRME' AND provider <> 'AVOIR'
          ORDER BY created_at LIMIT 1`,
      )
      .get(oldTicket.booking_id);

    // §2.6 : « Le remboursement part vers le numéro Mobile Money ayant servi au
    // paiement initial, jamais vers un numéro saisi au moment de la revente. »
    const targetPhone = originalPayment?.payer_phone || oldTicket.passenger_phone;

    await db
      .prepare(
        `INSERT INTO refunds
         (id, ticket_id, booking_id, amount, currency, target_phone, provider, reason, liable, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'Revente du billet', 'PLATEFORME', 'EN_FILE', ?)`,
      )
      .run(
        newId("rfd"),
        oldTicket.id,
        oldTicket.booking_id,
        net,
        listing.price_currency,
        targetPhone,
        originalPayment?.provider ?? "MPESA",
        nowIso(),
      );

    const sold = await db
      .prepare(
        `UPDATE resale_listings SET status = 'VENDUE', sold_to_ticket_id = ?, fee_amount = ?, sold_at = ?
        WHERE id = ? AND status = 'ACTIVE'`,
      )
      .run(newTicket.id, fee, nowIso(), listing.id);
    if (sold.changes !== 1) {
      // Le verrou FOR UPDATE pris plus haut rend ce cas improbable ; filet de
      // sécurité si jamais l'annonce a changé de statut entre-temps.
      throw errors.conflict("ANNONCE_INDISPONIBLE", "Ce siège vient d'être vendu à un autre acheteur.");
    }

    // d) SMS aux deux parties (étape 5).
    await queueSms(
      db,
      oldTicket.passenger_phone,
      `MOBEMBO : votre siege ${seat.seat_number} du ${formatDateTime(trip.departure_datetime)} a ete revendu. ` +
        `Remboursement de ${formatMoney(net, listing.price_currency as Currency)} en cours vers ${targetPhone}. ` +
        `Votre ancien billet ${oldTicket.ticket_code} n'est plus valable.`,
      "REVENTE_VENDUE",
    );
    await queueSms(
      db,
      params.buyerPhone,
      `MOBEMBO : billet ${newTicket.ticket_code} confirme, siege ${seat.seat_number}, ` +
        `${formatDateTime(trip.departure_datetime)}. Siege remis en vente par un autre passager.`,
      "REVENTE_ACHETEE",
    );

    await audit(
      {
        companyId: trip.company_id,
        action: "REVENTE_FINALISEE",
        entity: "resale_listing",
        entityId: listing.id,
        before: { ancienBillet: oldTicket.ticket_code, titulaire: oldTicket.passenger_phone },
        after: {
          nouveauBillet: newTicket.ticket_code,
          titulaire: params.buyerPhone,
          commission: fee,
          netVendeur: net,
        },
      },
      db,
    );

    return {
      ancien: await getTicket(oldTicket.id, db),
      nouveau: newTicket,
      commission: fee,
      remboursementVendeur: net,
    };
  });

  void flushSmsQueue();
  return outcome;
}

/**
 * §2.6 Transfert : gratuit, jusqu'à 1 h avant le départ, aucun décaissement.
 * « Il ne coûte rien à la plateforme […] C'est aussi le cas le plus fréquent. »
 *
 * Même risque de concurrence que `completeResale` : deux transferts (ou un
 * transfert et une revente) visant le même billet en même temps. La mise à
 * jour du billet re-vérifie donc son statut d'origine dans le WHERE et compte
 * les lignes affectées avant d'émettre le nouveau billet — le perdant de la
 * course échoue proprement au lieu de dupliquer le siège.
 */
export async function transferTicket(params: {
  ticketId: string;
  actorPhone: string;
  beneficiaryName: string;
  beneficiaryPhone: string;
}): Promise<{ ancien: TicketRow; nouveau: TicketRow }> {
  const outcome = await tx(async (db) => {
    const ticket = await getTicket(params.ticketId, db);
    if (ticket.passenger_phone !== params.actorPhone) {
      throw errors.forbidden("Ce billet n'est pas au nom de ce numéro.");
    }
    if (!["EMIS", "EN_REVENTE"].includes(ticket.status)) {
      throw errors.conflict("BILLET_NON_TRANSFERABLE", `Statut ${ticket.status} : transfert impossible.`);
    }

    const trip = await getTrip(ticket.trip_id, db);
    const policy = companyPolicy(await getCompany(trip.company_id, db));
    if (hoursUntil(trip.departure_datetime) < policy.transferDeadlineHours) {
      throw errors.conflict(
        "DELAI_TRANSFERT_DEPASSE",
        `Le transfert ferme ${policy.transferDeadlineHours} h avant le départ.`,
      );
    }

    const seat = (await db
      .prepare<{ id: string; seat_number: string }>(
        `SELECT id, seat_number FROM trip_seats WHERE id = ?`,
      )
      .get(ticket.trip_seat_id)) as { id: string; seat_number: string };

    await db
      .prepare(`UPDATE resale_listings SET status = 'RETIREE' WHERE ticket_id = ? AND status = 'ACTIVE'`)
      .run(ticket.id);
    const transferred = await db
      .prepare(
        `UPDATE tickets SET status = 'TRANSFERE', updated_at = ?
          WHERE id = ? AND status = ?`,
      )
      .run(nowIso(), ticket.id, ticket.status);
    if (transferred.changes !== 1) {
      throw errors.conflict(
        "BILLET_NON_TRANSFERABLE",
        "Ce billet vient de changer de statut (revente ou transfert concurrent).",
      );
    }

    const newTicket = await issueTicket(db, {
      bookingId: ticket.booking_id,
      tripId: ticket.trip_id,
      seat,
      passengerName: params.beneficiaryName,
      passengerPhone: params.beneficiaryPhone,
      priceAmount: ticket.price_amount,
      priceCurrency: ticket.price_currency as Currency,
      agencyId: ticket.agency_id,
      parentTicketId: ticket.id,
    });

    await queueSms(
      db,
      ticket.passenger_phone,
      `MOBEMBO : votre billet ${ticket.ticket_code} a ete transfere a ${params.beneficiaryName}. ` +
        `Il n'est plus valable a votre nom.`,
      "TRANSFERT",
    );

    await audit(
      {
        companyId: trip.company_id,
        action: "TRANSFERT_BILLET",
        entity: "ticket",
        entityId: ticket.id,
        before: { titulaire: ticket.passenger_phone },
        after: { titulaire: params.beneficiaryPhone, nouveauBillet: newTicket.ticket_code },
      },
      db,
    );

    return { ancien: await getTicket(ticket.id, db), nouveau: newTicket };
  });
  void flushSmsQueue();
  return outcome;
}

export type { Policy as CompanyPolicy, ResaleListingRow };
export { getBooking };
