import type { DbHandle } from "@/lib/db";
import { getDb, tx } from "@/lib/db";
import { newId, newTicketCode } from "@/lib/core/ids";
import { nowIso, isPast } from "@/lib/core/time";
import { errors } from "@/lib/core/errors";
import { percentOf, type Currency } from "@/lib/core/money";
import { queueSms, flushSmsQueue } from "@/lib/sms";
import { getProvider } from "@/lib/payments/registry";
import { audit } from "./audit";
import { buildReservationQr } from "./qr";
import { companyAccess, hasModule } from "./access";
import { reservationById, type ReservationView } from "./reservations";
import type { PaymentProviderId } from "./types";

/**
 * Phase 3 — « Paiement et billet numérique » (§13 à §17).
 *
 * Le paiement se greffe sur la réservation de phase 2 : §14.1 dit « après
 * réservation, le voyageur choisit un moyen de paiement ». La place est donc
 * déjà tenue quand le paiement commence — ce qui change tout par rapport à la
 * billetterie à sièges, où le paiement court contre un verrou de sept minutes.
 * Ici, un paiement qui échoue ne fait perdre ni la place ni la réservation :
 * le voyageur paiera à l'agence, comme en phase 2.
 *
 * Le billet émis n'a pas de siège (§14.3 n'en mentionne aucun) : numéroter les
 * places relève de la phase 4 (§19.2), et une agence de phase 3 n'a pas de
 * plan de sièges à numéroter.
 */

export type SchedulePaymentStatus =
  | "INITIE"
  | "CONFIRME"
  | "ECHOUE"
  | "INDETERMINE"
  | "A_REMBOURSER"
  | "REMBOURSE";

export type ReservationPaymentState = "SUR_PLACE" | "EN_ATTENTE" | "PAYEE" | "REMBOURSEE";

export type ScheduleTicketStatus = "VALIDE" | "UTILISE" | "ANNULE" | "EXPIRE";

export const TICKET_STATUS_LABELS: Record<ScheduleTicketStatus, string> = {
  VALIDE: "À venir",
  UTILISE: "Utilisé",
  ANNULE: "Annulé",
  EXPIRE: "Expiré",
};

/** §3.2 : au-delà de cette fenêtre sans réponse, un humain tranche. */
export const POLL_WINDOW_MS = 5 * 60_000;
export const MAX_POLLS = 10;

export interface SchedulePaymentRow {
  id: string;
  reservation_id: string;
  company_id: string;
  provider: PaymentProviderId;
  provider_ref: string | null;
  idempotency_key: string;
  payer_phone: string;
  amount: number;
  fee_amount: number;
  commission_amount: number;
  currency: Currency;
  status: SchedulePaymentStatus;
  raw_response: string | null;
  polls: number;
  last_polled_at: string | null;
  created_at: string;
  resolved_at: string | null;
}

export interface ScheduleTicketRow {
  id: string;
  reservation_id: string;
  company_id: string;
  ticket_code: string;
  qr_signature: string;
  seats: number;
  status: ScheduleTicketStatus;
  paid_amount: number;
  paid_currency: Currency;
  payment_id: string | null;
  issued_at: string;
  used_at: string | null;
  updated_at: string;
}

/**
 * §14.1 : « L'application affiche clairement : prix du billet, nombre de
 * places, montant total, éventuels frais, montant final à payer. »
 *
 * Les frais valent zéro : la commission de §17 est prélevée sur le reversement
 * à l'agence, jamais ajoutée au voyageur. Le devis le dit explicitement plutôt
 * que d'omettre la ligne — un montant final identique au sous-total est une
 * information, pas un détail.
 */
export interface PaymentQuote {
  reservationId: string;
  prixUnitaire: number;
  places: number;
  sousTotal: number;
  frais: number;
  total: number;
  devise: Currency;
  /** Part Mobembo, retenue sur le reversement. Affichée à l'agence seulement. */
  commission: number;
  payable: boolean;
  motifNonPayable: string | null;
}

export async function paymentQuote(
  reservationId: string,
  db: DbHandle = getDb(),
): Promise<PaymentQuote> {
  const reservation = await reservationById(reservationId, db);
  if (!reservation) throw errors.notFound("Réservation");

  const prixUnitaire = reservation.price_usd ?? reservation.price_cdf ?? 0;
  const devise: Currency = reservation.price_usd !== null ? "USD" : "CDF";
  const sousTotal = prixUnitaire * reservation.seats;
  const frais = 0;

  const acces = await companyAccess(reservation.company_id, db);
  const taux = await onlineCommissionRate(reservation.company_id, db);

  let motif: string | null = null;
  if (!hasModule(acces, "PAIEMENT")) {
    motif = "Cette agence n'accepte pas encore le paiement en ligne. Réglez sur place.";
  } else if (prixUnitaire <= 0) {
    motif = "Le prix de ce départ n'est pas publié : réglez auprès de l'agence.";
  } else if (reservation.status !== "CONFIRMEE") {
    motif = "Cette réservation n'est plus active.";
  } else if (reservation.payment_status === "PAYEE") {
    motif = "Cette réservation est déjà payée.";
  } else if (isPast(reservation.departure_at)) {
    motif = "Ce départ est passé.";
  }

  return {
    reservationId,
    prixUnitaire,
    places: reservation.seats,
    sousTotal,
    frais,
    total: sousTotal + frais,
    devise,
    commission: percentOf(sousTotal, taux),
    payable: motif === null,
    motifNonPayable: motif,
  };
}

async function onlineCommissionRate(companyId: string, db: DbHandle): Promise<number> {
  const row = await db
    .prepare<{ online_commission_rate: number }>(
      `SELECT online_commission_rate FROM companies WHERE id = ?`,
    )
    .get(companyId);
  return row?.online_commission_rate ?? 0.1;
}

export interface InitiateReservationPaymentResult {
  payment: SchedulePaymentRow;
  ticket: ScheduleTicketRow | null;
  /** Vrai si la clé d'idempotence avait déjà servi : aucun second débit. */
  replayed: boolean;
}

/**
 * §3.2 : « Clé d'idempotence obligatoire sur chaque initiation de paiement. Un
 * double clic ne débite jamais deux fois. » L'unicité est portée par l'index
 * unique sur `idempotency_key` — c'est la base qui refuse le doublon, pas un
 * test applicatif qui se ferait doubler par deux requêtes simultanées.
 */
export async function initiateReservationPayment(params: {
  reservationId: string;
  provider: PaymentProviderId;
  payerPhone: string;
  idempotencyKey: string;
}): Promise<InitiateReservationPaymentResult> {
  const db = getDb();

  const existing = await db
    .prepare<SchedulePaymentRow>(`SELECT * FROM schedule_payments WHERE idempotency_key = ?`)
    .get(params.idempotencyKey);
  if (existing) {
    return {
      payment: existing,
      ticket: await ticketOfReservation(existing.reservation_id, db),
      replayed: true,
    };
  }

  const devis = await paymentQuote(params.reservationId, db);
  if (!devis.payable) {
    throw errors.conflict("PAIEMENT_IMPOSSIBLE", devis.motifNonPayable!);
  }

  const reservation = (await reservationById(params.reservationId, db))!;
  const paymentId = newId("spy");
  const now = nowIso();

  await db
    .prepare(
      `INSERT INTO schedule_payments
         (id, reservation_id, company_id, provider, provider_ref, idempotency_key, payer_phone,
          amount, fee_amount, commission_amount, currency, status, created_at)
       VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, 'INITIE', ?)`,
    )
    .run(
      paymentId,
      params.reservationId,
      reservation.company_id,
      params.provider,
      params.idempotencyKey,
      params.payerPhone,
      devis.total,
      devis.frais,
      devis.commission,
      devis.devise,
      now,
    );

  await db
    .prepare(`UPDATE schedule_bookings SET payment_status = 'EN_ATTENTE', updated_at = ? WHERE id = ?`)
    .run(now, params.reservationId);

  const provider = getProvider(params.provider);
  const result = await provider.charge({
    idempotencyKey: params.idempotencyKey,
    payerPhone: params.payerPhone,
    amount: devis.total,
    currency: devis.devise,
    reference: reservation.reference,
    description: `Mobembo ${reservation.reference}`,
  });

  await db
    .prepare(`UPDATE schedule_payments SET provider_ref = ?, raw_response = ? WHERE id = ?`)
    .run(result.providerRef, JSON.stringify(result.raw), paymentId);

  if (result.status === "CONFIRME" || result.status === "ECHOUE") {
    await settleReservationPayment(paymentId, result.status, result.raw);
  }

  return {
    payment: (await getSchedulePayment(paymentId, db))!,
    ticket: await ticketOfReservation(params.reservationId, db),
    replayed: false,
  };
}

export async function getSchedulePayment(
  id: string,
  db: DbHandle = getDb(),
): Promise<SchedulePaymentRow | null> {
  const row = await db
    .prepare<SchedulePaymentRow>(`SELECT * FROM schedule_payments WHERE id = ?`)
    .get(id);
  return row ?? null;
}

/**
 * §16 : « Un billet n'est confirmé qu'après confirmation du paiement » et « un
 * paiement échoué ne doit pas générer un billet valide ». L'émission du billet
 * vit donc ici, dans la même transaction que le passage du paiement à
 * CONFIRME, et nulle part ailleurs.
 *
 * Idempotent : un webhook rejoué ne réémet jamais un second billet — l'unicité
 * de `schedule_tickets.reservation_id` le garantit en base, et le court-circuit
 * ci-dessous évite d'y arriver.
 */
export async function settleReservationPayment(
  paymentId: string,
  status: "CONFIRME" | "ECHOUE" | "INDETERMINE",
  raw?: unknown,
): Promise<{ payment: SchedulePaymentRow; ticket: ScheduleTicketRow | null }> {
  const issued = await tx(async (db) => {
    const payment = await db
      .prepare<SchedulePaymentRow>(`SELECT * FROM schedule_payments WHERE id = ? FOR UPDATE`)
      .get(paymentId);
    if (!payment) throw errors.notFound("Paiement");

    // Déjà tranché : on ne rejoue rien, on renvoie l'état stable.
    if (payment.status !== "INITIE") return { payment, ticket: null, deja: true };

    const now = nowIso();
    await db
      .prepare(
        `UPDATE schedule_payments SET status = ?, raw_response = ?, resolved_at = ? WHERE id = ?`,
      )
      .run(status, raw === undefined ? payment.raw_response : JSON.stringify(raw), now, paymentId);

    if (status !== "CONFIRME") {
      // La réservation survit à un paiement échoué : la place reste tenue et le
      // voyageur paiera à l'agence. C'est la différence avec la billetterie à
      // sièges, où l'échec libère le siège.
      await db
        .prepare(
          `UPDATE schedule_bookings SET payment_status = 'SUR_PLACE', updated_at = ?
            WHERE id = ? AND payment_status = 'EN_ATTENTE'`,
        )
        .run(now, payment.reservation_id);
      return { payment: { ...payment, status }, ticket: null, deja: false };
    }

    const reservation = await db
      .prepare<{
        id: string;
        schedule_id: string;
        travel_date: string;
        seats: number;
        passenger_phone: string;
        passenger_name: string;
        reference: string;
        status: string;
      }>(
        `SELECT id, schedule_id, travel_date, seats, passenger_phone, passenger_name, reference, status
           FROM schedule_bookings WHERE id = ? FOR UPDATE`,
      )
      .get(payment.reservation_id);
    if (!reservation) throw errors.notFound("Réservation");

    const secret = await db
      .prepare<{ qr_secret: string }>(`SELECT qr_secret FROM companies WHERE id = ?`)
      .get(payment.company_id);
    if (!secret) throw errors.notFound("Agence");

    const ticketId = newId("sbt");
    const ticket: ScheduleTicketRow = {
      id: ticketId,
      reservation_id: reservation.id,
      company_id: payment.company_id,
      ticket_code: newTicketCode(),
      qr_signature: buildReservationQr(
        { ticketId, scheduleId: reservation.schedule_id, travelDate: reservation.travel_date },
        secret.qr_secret,
      ),
      seats: reservation.seats,
      status: "VALIDE",
      paid_amount: payment.amount,
      paid_currency: payment.currency,
      payment_id: payment.id,
      issued_at: now,
      used_at: null,
      updated_at: now,
    };

    await db
      .prepare(
        `INSERT INTO schedule_tickets
           (id, reservation_id, company_id, ticket_code, qr_signature, seats, status,
            paid_amount, paid_currency, payment_id, issued_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'VALIDE', ?, ?, ?, ?, ?)`,
      )
      .run(
        ticket.id,
        ticket.reservation_id,
        ticket.company_id,
        ticket.ticket_code,
        ticket.qr_signature,
        ticket.seats,
        ticket.paid_amount,
        ticket.paid_currency,
        ticket.payment_id,
        now,
        now,
      );

    await db
      .prepare(`UPDATE schedule_bookings SET payment_status = 'PAYEE', updated_at = ? WHERE id = ?`)
      .run(now, reservation.id);

    // §2.5 : « Le SMS est obligatoire, pas optionnel. C'est le seul canal qui
    // survit à un téléphone déchargé, réinstallé ou changé. »
    await queueSms(
      db,
      reservation.passenger_phone,
      `MOBEMBO : paiement confirme. Billet ${ticket.ticket_code} pour ${reservation.seats} place(s), ` +
        `voyage du ${reservation.travel_date}. Presentez ce code ou votre QR au depart.`,
      "BILLET_EMIS",
    );

    await audit(
      {
        role: "PASSAGER",
        companyId: payment.company_id,
        action: "PAIEMENT_RESERVATION",
        entity: "schedule_ticket",
        entityId: ticket.id,
        after: { reference: reservation.reference, montant: payment.amount, devise: payment.currency },
      },
      db,
    );

    return { payment: { ...payment, status }, ticket, deja: false };
  });

  if (!issued.deja) await flushSmsQueue();
  const payment = (await getSchedulePayment(paymentId))!;
  return { payment, ticket: await ticketOfReservation(payment.reservation_id) };
}

/**
 * §3.2 : polling de secours quand aucun webhook n'arrive. Passé la fenêtre,
 * le paiement devient INDETERMINE — le système ne devine jamais à la place
 * d'un humain.
 */
export async function pollReservationPayment(paymentId: string): Promise<SchedulePaymentRow> {
  const db = getDb();
  const payment = await getSchedulePayment(paymentId, db);
  if (!payment) throw errors.notFound("Paiement");
  if (payment.status !== "INITIE") return payment;

  if (!payment.provider_ref) return payment;

  const expire = Date.now() - new Date(payment.created_at).getTime() > POLL_WINDOW_MS;
  if (expire || payment.polls >= MAX_POLLS) {
    const { payment: resolu } = await settleReservationPayment(paymentId, "INDETERMINE");
    await openIndeterminateTicket(db, resolu);
    return resolu;
  }

  await db
    .prepare(`UPDATE schedule_payments SET polls = polls + 1, last_polled_at = ? WHERE id = ?`)
    .run(nowIso(), paymentId);

  const result = await getProvider(payment.provider).pollCharge(payment.provider_ref);
  if (result.status === "CONFIRME" || result.status === "ECHOUE") {
    const { payment: resolu } = await settleReservationPayment(paymentId, result.status, result.raw);
    return resolu;
  }
  return (await getSchedulePayment(paymentId, db))!;
}

async function openIndeterminateTicket(db: DbHandle, payment: SchedulePaymentRow): Promise<void> {
  await db
    .prepare(
      `INSERT INTO support_tickets (id, kind, reference, severity, body, status, created_at)
       VALUES (?, 'PAIEMENT_INDETERMINE', ?, 'MAJEURE', ?, 'OUVERT', ?)`,
    )
    .run(
      newId("sup"),
      payment.id,
      `Paiement de réservation sans réponse après 5 minutes. Opérateur ${payment.provider}, ` +
        `payeur ${payment.payer_phone}, montant ${payment.amount} ${payment.currency}. ` +
        `Vérifier chez l'opérateur avant d'émettre ou de rembourser.`,
      nowIso(),
    );
}

export async function ticketOfReservation(
  reservationId: string,
  db: DbHandle = getDb(),
): Promise<ScheduleTicketRow | null> {
  const row = await db
    .prepare<ScheduleTicketRow>(`SELECT * FROM schedule_tickets WHERE reservation_id = ?`)
    .get(reservationId);
  return row ?? null;
}

/** Billet numérique complet — §14.3, tout ce qui s'affiche au voyageur. */
export interface DigitalTicket extends ScheduleTicketRow {
  reservation: ReservationView;
}

export async function digitalTicket(
  ticketId: string,
  db: DbHandle = getDb(),
): Promise<DigitalTicket | null> {
  const ticket = await db
    .prepare<ScheduleTicketRow>(`SELECT * FROM schedule_tickets WHERE id = ? OR ticket_code = ?`)
    .get(ticketId, ticketId.toUpperCase());
  if (!ticket) return null;
  const reservation = await reservationById(ticket.reservation_id, db);
  if (!reservation) return null;
  return { ...ticket, reservation };
}

/**
 * §14.4 : « à venir, utilisés, annulés, expirés ». Le passage de VALIDE à
 * EXPIRE se fait à la lecture, comme partout ailleurs (§3.1 : aucune tâche de
 * fond, un cron en panne laisserait des billets « à venir » pour toujours).
 */
export async function expirePastTickets(db: DbHandle = getDb()): Promise<number> {
  const result = await db
    .prepare(
      `UPDATE schedule_tickets t
          JOIN schedule_bookings b ON b.id = t.reservation_id
          SET t.status = 'EXPIRE', t.updated_at = ?
        WHERE t.status = 'VALIDE' AND b.departure_at < ?`,
    )
    .run(nowIso(), nowIso());
  return result.changes;
}

export async function passengerTickets(
  phone: string,
  db: DbHandle = getDb(),
): Promise<DigitalTicket[]> {
  const rows = await db
    .prepare<ScheduleTicketRow>(
      `SELECT t.* FROM schedule_tickets t
         JOIN schedule_bookings b ON b.id = t.reservation_id
        WHERE b.passenger_phone = ?
        ORDER BY b.departure_at DESC`,
    )
    .all(phone);

  const tickets: DigitalTicket[] = [];
  for (const row of rows) {
    const reservation = await reservationById(row.reservation_id, db);
    if (reservation) tickets.push({ ...row, reservation });
  }
  return tickets;
}

/** L'agence marque un remboursement effectué hors plateforme. */
export async function markRefunded(params: {
  paymentId: string;
  companyId: string;
  actor: { userId: string; role: string };
}): Promise<SchedulePaymentRow> {
  return tx(async (db) => {
    const payment = await db
      .prepare<SchedulePaymentRow>(`SELECT * FROM schedule_payments WHERE id = ? FOR UPDATE`)
      .get(params.paymentId);
    if (!payment) throw errors.notFound("Paiement");
    if (payment.company_id !== params.companyId) {
      throw errors.forbidden("Ce paiement appartient à une autre agence.");
    }
    if (payment.status !== "A_REMBOURSER") {
      throw errors.conflict("RIEN_A_REMBOURSER", "Ce paiement n'attend pas de remboursement.");
    }
    await db
      .prepare(`UPDATE schedule_payments SET status = 'REMBOURSE', resolved_at = ? WHERE id = ?`)
      .run(nowIso(), params.paymentId);
    await audit(
      {
        userId: params.actor.userId,
        role: params.actor.role,
        companyId: params.companyId,
        action: "REMBOURSEMENT_CONFIRME",
        entity: "schedule_payment",
        entityId: params.paymentId,
      },
      db,
    );
    return (await getSchedulePayment(params.paymentId, db))!;
  });
}

/** §15 — ce que l'agence voit de sa phase 3. */
export interface TicketingSummary {
  billetsVendus: number;
  placesVendues: number;
  encaisseUsd: number;
  encaisseCdf: number;
  commissionUsd: number;
  enAttente: number;
  billetsAnnules: number;
  billetsControles: number;
  remboursementsATraiter: number;
}

export async function ticketingSummary(
  companyId: string,
  db: DbHandle = getDb(),
): Promise<TicketingSummary> {
  const row = await db
    .prepare<TicketingSummary>(
      `SELECT
         (SELECT COUNT(*) FROM schedule_tickets WHERE company_id = ?) AS billetsVendus,
         (SELECT COALESCE(SUM(seats), 0) FROM schedule_tickets
           WHERE company_id = ? AND status IN ('VALIDE','UTILISE')) AS placesVendues,
         (SELECT COALESCE(SUM(amount), 0) FROM schedule_payments
           WHERE company_id = ? AND status = 'CONFIRME' AND currency = 'USD') AS encaisseUsd,
         (SELECT COALESCE(SUM(amount), 0) FROM schedule_payments
           WHERE company_id = ? AND status = 'CONFIRME' AND currency = 'CDF') AS encaisseCdf,
         (SELECT COALESCE(SUM(commission_amount), 0) FROM schedule_payments
           WHERE company_id = ? AND status = 'CONFIRME' AND currency = 'USD') AS commissionUsd,
         (SELECT COUNT(*) FROM schedule_payments
           WHERE company_id = ? AND status IN ('INITIE','INDETERMINE')) AS enAttente,
         (SELECT COUNT(*) FROM schedule_tickets WHERE company_id = ? AND status = 'ANNULE') AS billetsAnnules,
         (SELECT COUNT(*) FROM schedule_tickets WHERE company_id = ? AND status = 'UTILISE') AS billetsControles,
         (SELECT COUNT(*) FROM schedule_payments WHERE company_id = ? AND status = 'A_REMBOURSER') AS remboursementsATraiter`,
    )
    .get(companyId, companyId, companyId, companyId, companyId, companyId, companyId, companyId, companyId);
  return (
    row ?? {
      billetsVendus: 0,
      placesVendues: 0,
      encaisseUsd: 0,
      encaisseCdf: 0,
      commissionUsd: 0,
      enAttente: 0,
      billetsAnnules: 0,
      billetsControles: 0,
      remboursementsATraiter: 0,
    }
  );
}

export interface CompanyTicketRow extends ScheduleTicketRow {
  reference: string;
  passenger_name: string;
  passenger_phone: string;
  travel_date: string;
  departure_at: string;
  origin_city: string;
  destination_city: string;
  departure_time: string;
  payment_status: SchedulePaymentStatus | null;
  payment_provider: PaymentProviderId | null;
  payment_id_ref: string | null;
}

export async function companyTickets(
  companyId: string,
  db: DbHandle = getDb(),
): Promise<CompanyTicketRow[]> {
  return db
    .prepare<CompanyTicketRow>(
      `SELECT t.*, b.reference, b.passenger_name, b.passenger_phone, b.travel_date,
              b.departure_at, s.origin_city, s.destination_city, s.departure_time,
              p.status AS payment_status, p.provider AS payment_provider, p.id AS payment_id_ref
         FROM schedule_tickets t
         JOIN schedule_bookings b ON b.id = t.reservation_id
         JOIN schedules s ON s.id = b.schedule_id
         LEFT JOIN schedule_payments p ON p.id = t.payment_id
        WHERE t.company_id = ?
        ORDER BY b.departure_at DESC
        LIMIT 200`,
    )
    .all(companyId);
}
