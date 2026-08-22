import type { Database } from "better-sqlite3";
import { getDb, tx } from "@/lib/db";
import { newId } from "@/lib/core/ids";
import { nowIso, hoursUntil } from "@/lib/core/time";
import { errors } from "@/lib/core/errors";
import type { Currency } from "@/lib/core/money";
import { convert } from "@/lib/core/money";
import { audit } from "./audit";
import { issueTicket } from "./tickets";
import { lockSeats, releaseExpiredLocks, releaseLocks } from "./seats";
import {
  companyPolicy,
  getBooking,
  getBus,
  getCompany,
  getTrip,
  tripPrice,
  type BookingRow,
  type TicketRow,
} from "./repo";
import type { Channel } from "./types";

export interface PassengerInput {
  seatNumber: string;
  name: string;
  phone?: string;
}

/**
 * §2.5.3 : « Sélection du siège sur plan, puis verrouillage 7 minutes. »
 * Le verrou précède l'identification : il est posé sous un identifiant de
 * maintien anonyme, que le client conserve jusqu'à la création de la
 * réservation.
 */
export function holdSeats(params: {
  tripId: string;
  seatNumbers: string[];
  holdId: string;
  phone?: string | null;
}): { holdId: string; lockedUntil: string } {
  const trip = getTrip(params.tripId);
  if (trip.departure_mode !== "HORAIRE_FIXE") {
    // §2.2 : « Seul mode autorisé pour la vente en ligne. »
    throw errors.conflict(
      "MODE_DEPART_NON_VENDABLE_EN_LIGNE",
      "Ce départ se fait au remplissage : il ne se vend qu'au guichet.",
    );
  }
  if (!["PLANIFIE", "EN_VENTE"].includes(trip.status)) {
    throw errors.conflict("TRAJET_FERME", "La vente est fermée sur ce trajet.");
  }
  const policy = companyPolicy(getCompany(trip.company_id));

  const result = lockSeats({
    tripId: params.tripId,
    seatNumbers: params.seatNumbers,
    channel: "EN_LIGNE",
    sessionId: params.holdId,
    phone: params.phone ?? params.holdId,
    minutes: policy.seatLockMinutes,
    maxLocksPerPhone: policy.maxLocksPerPhone,
  });
  return { holdId: params.holdId, lockedUntil: result.lockedUntil };
}

export function releaseHold(tripId: string, holdId: string): number {
  return tx((db) => releaseLocks(db, tripId, holdId));
}

/**
 * §2.5.4-5 : identification puis paiement. La réservation naît « EN_ATTENTE » ;
 * elle ne devient « CONFIRME » qu'au paiement effectif. Aucun billet n'existe
 * avant.
 *
 * §2.5 : « Réservation de groupe : une réservation contient plusieurs billets —
 * plusieurs sièges, un seul paiement. »
 */
export function createBooking(params: {
  tripId: string;
  holdId: string;
  buyerPhone: string;
  buyerName: string;
  passengers: PassengerInput[];
  currency: Currency;
  /** §2.9 : un avoir se consomme sur un nouvel achat. */
  useCreditId?: string | null;
}): { booking: BookingRow; dueAmount: number } {
  return tx((db) => {
    releaseExpiredLocks(db);
    const trip = getTrip(params.tripId, db);
    const company = getCompany(trip.company_id, db);
    const policy = companyPolicy(company);
    const bus = getBus(trip.bus_id, db);
    const price = tripPrice(params.tripId, bus.category, db);

    const held = db
      .prepare(
        `SELECT * FROM trip_seats
          WHERE trip_id = ? AND lock_session_id = ? AND status = 'VERROUILLE'`,
      )
      .all(params.tripId, params.holdId) as Array<{ id: string; seat_number: string }>;

    if (held.length === 0) {
      throw errors.conflict(
        "VERROU_EXPIRE",
        "Votre maintien de siège a expiré. Reprenez la sélection.",
      );
    }
    const heldNumbers = new Set(held.map((s) => s.seat_number));
    for (const passenger of params.passengers) {
      if (!heldNumbers.has(passenger.seatNumber)) {
        throw errors.conflict(
          "SIEGE_NON_MAINTENU",
          `Le siège ${passenger.seatNumber} n'est plus maintenu par cette session.`,
        );
      }
    }

    // Le plafond de verrous par numéro se vérifie ici : c'est le premier
    // moment où le téléphone de l'acheteur est connu (§2.5).
    const others = db
      .prepare(
        `SELECT COUNT(*) AS n FROM trip_seats
          WHERE lock_phone = ? AND status = 'VERROUILLE' AND lock_session_id <> ?`,
      )
      .get(params.buyerPhone, params.holdId) as { n: number };
    if (others.n + params.passengers.length > policy.maxLocksPerPhone) {
      throw errors.conflict(
        "TROP_DE_VERROUS",
        `Maximum ${policy.maxLocksPerPhone} sièges en attente de paiement par numéro.`,
      );
    }
    db.prepare(
      `UPDATE trip_seats SET lock_phone = ? WHERE trip_id = ? AND lock_session_id = ?`,
    ).run(params.buyerPhone, params.tripId, params.holdId);

    const unitPrice = params.currency === "USD" ? price.price_usd : price.price_cdf;
    const gross = unitPrice * params.passengers.length;

    let creditApplied = 0;
    if (params.useCreditId) {
      const credit = db
        .prepare(
          `SELECT * FROM credits WHERE id = ? AND passenger_phone = ? AND status = 'ACTIF'`,
        )
        .get(params.useCreditId, params.buyerPhone) as
        | { id: string; amount: number; currency: Currency; expires_at: string; company_id: string }
        | undefined;
      if (!credit) throw errors.notFound("Avoir");
      if (new Date(credit.expires_at) <= new Date()) {
        throw errors.conflict("AVOIR_EXPIRE", "Cet avoir a expiré.");
      }
      if (credit.company_id !== trip.company_id) {
        throw errors.conflict(
          "AVOIR_AUTRE_COMPAGNIE",
          "Cet avoir n'est utilisable que chez la compagnie qui l'a émis.",
        );
      }
      creditApplied = Math.min(
        gross,
        convert(credit.amount, credit.currency, params.currency, company.currency_rate_usd_cdf),
      );
    }

    const bookingId = newId("bkg");
    db.prepare(
      `INSERT INTO bookings
         (id, trip_id, buyer_phone, buyer_name, channel, agency_id, sold_by_user_id,
          cash_session_id, total_amount, currency, status, credit_applied, created_at)
       VALUES (?, ?, ?, ?, 'EN_LIGNE', NULL, NULL, NULL, ?, ?, 'EN_ATTENTE', ?, ?)`,
    ).run(bookingId, params.tripId, params.buyerPhone, params.buyerName, gross, params.currency, creditApplied, nowIso());

    // Les passagers sont mémorisés tant que les billets n'existent pas : la
    // confirmation de paiement doit pouvoir émettre sans redemander les noms.
    db.prepare(
      `INSERT INTO sync_log (id, device_id, client_op_id, kind, payload_json, result, server_time)
       VALUES (?, 'serveur', ?, 'PASSAGERS_RESERVATION', ?, 'ENREGISTRE', ?)`,
    ).run(
      newId("syn"),
      `passengers:${bookingId}`,
      JSON.stringify({ holdId: params.holdId, passengers: params.passengers, useCreditId: params.useCreditId ?? null }),
      nowIso(),
    );

    return {
      booking: getBooking(bookingId, db),
      dueAmount: gross - creditApplied,
    };
  });
}

export function bookingPassengers(bookingId: string, db: Database = getDb()): {
  holdId: string;
  passengers: PassengerInput[];
  useCreditId: string | null;
} {
  const row = db
    .prepare(`SELECT payload_json FROM sync_log WHERE client_op_id = ?`)
    .get(`passengers:${bookingId}`) as { payload_json: string } | undefined;
  if (!row) throw errors.notFound("Liste des passagers de la réservation");
  return JSON.parse(row.payload_json);
}

/**
 * Émission des billets d'une réservation payée. Appelée par la confirmation de
 * paiement, dans la transaction de celle-ci : un paiement confirmé sans billet
 * émis est une anomalie bloquante (§5.2).
 */
export function confirmBooking(db: Database, bookingId: string): TicketRow[] {
  const booking = getBooking(bookingId, db);
  if (booking.status === "CONFIRME") {
    return db.prepare(`SELECT * FROM tickets WHERE booking_id = ?`).all(bookingId) as TicketRow[];
  }
  if (booking.status !== "EN_ATTENTE") {
    throw errors.conflict("RESERVATION_CLOSE", "Cette réservation n'est plus en attente.");
  }

  const { holdId, passengers, useCreditId } = bookingPassengers(bookingId, db);
  const seats = db
    .prepare(
      `SELECT * FROM trip_seats WHERE trip_id = ? AND lock_session_id = ? AND status = 'VERROUILLE'`,
    )
    .all(booking.trip_id, holdId) as Array<{ id: string; seat_number: string }>;

  const bySeat = new Map(seats.map((s) => [s.seat_number, s]));
  const unitPrice = Math.round(booking.total_amount / Math.max(passengers.length, 1));
  const tickets: TicketRow[] = [];

  for (const passenger of passengers) {
    const seat = bySeat.get(passenger.seatNumber);
    if (!seat) {
      throw errors.conflict(
        "VERROU_PERDU",
        `Le siège ${passenger.seatNumber} n'est plus maintenu — paiement à rembourser.`,
      );
    }
    tickets.push(
      issueTicket(db, {
        bookingId,
        tripId: booking.trip_id,
        seat,
        passengerName: passenger.name,
        passengerPhone: passenger.phone || booking.buyer_phone,
        priceAmount: unitPrice,
        priceCurrency: booking.currency as Currency,
      }),
    );
  }

  if (useCreditId && booking.credit_applied > 0) {
    db.prepare(
      `UPDATE credits SET status = 'CONSOMME', consumed_booking_id = ? WHERE id = ?`,
    ).run(bookingId, useCreditId);
  }

  db.prepare(`UPDATE bookings SET status = 'CONFIRME', confirmed_at = ? WHERE id = ?`).run(
    nowIso(),
    bookingId,
  );

  audit(
    {
      action: "CONFIRMATION_RESERVATION",
      entity: "booking",
      entityId: bookingId,
      after: { tickets: tickets.map((t) => t.ticket_code) },
    },
    db,
  );

  return tickets;
}

/**
 * §2.4 Vente au guichet. Verrou, billet, encaissement et mouvement de caisse
 * dans une seule transaction : au guichet il n'y a pas d'attente d'opérateur,
 * donc pas de raison de laisser une réservation en suspens.
 */
export function posSell(params: {
  tripId: string;
  seatNumbers: string[];
  passengers: PassengerInput[];
  buyerPhone: string;
  buyerName: string;
  cashSessionId: string;
  currency: Currency;
  actor: { userId: string; role: string; companyId: string; agencyId: string };
  /** Identifiant d'opération client, pour l'idempotence de la synchro hors-ligne. */
  clientOpId?: string;
  clientTime?: string;
  deviceId?: string;
  ip?: string | null;
}): { booking: BookingRow; tickets: TicketRow[] } {
  return tx((db) => {
    // Idempotence : une vente hors-ligne rejouée deux fois par la file de
    // synchronisation ne produit qu'un billet (§5.2).
    if (params.clientOpId) {
      const replayed = db
        .prepare(`SELECT server_ref FROM sync_log WHERE client_op_id = ?`)
        .get(params.clientOpId) as { server_ref: string | null } | undefined;
      if (replayed?.server_ref) {
        return {
          booking: getBooking(replayed.server_ref, db),
          tickets: db
            .prepare(`SELECT * FROM tickets WHERE booking_id = ?`)
            .all(replayed.server_ref) as TicketRow[],
        };
      }
    }

    releaseExpiredLocks(db);
    const trip = getTrip(params.tripId, db);
    if (trip.company_id !== params.actor.companyId) {
      throw errors.forbidden("Ce trajet appartient à une autre compagnie.");
    }
    if (["PARTI", "CLOTURE", "ANNULE"].includes(trip.status)) {
      throw errors.conflict("TRAJET_FERME", "La vente est fermée sur ce trajet.");
    }

    const session = db
      .prepare(`SELECT * FROM cash_sessions WHERE id = ?`)
      .get(params.cashSessionId) as
      | { id: string; user_id: string; agency_id: string; closed_at: string | null }
      | undefined;
    // §2.4 : « Le guichetier ne vend que dans une session de caisse ouverte. »
    if (!session) throw errors.notFound("Session de caisse");
    if (session.closed_at) {
      throw errors.conflict("CAISSE_FERMEE", "Cette session de caisse est fermée.");
    }
    if (session.user_id !== params.actor.userId) {
      throw errors.forbidden("Cette session de caisse appartient à un autre agent.");
    }

    const bus = getBus(trip.bus_id, db);
    const price = tripPrice(params.tripId, bus.category, db);
    // §2.4 : « Le guichetier ne peut pas modifier un tarif. Les prix viennent
    // de la grille tarifaire du trajet. » Aucun montant n'est accepté du client.
    const unitPrice = params.currency === "USD" ? price.price_usd : price.price_cdf;
    const total = unitPrice * params.passengers.length;

    const holdId = newId("pos");
    lockSeatsInline(db, {
      tripId: params.tripId,
      seatNumbers: params.seatNumbers,
      holdId,
      phone: params.buyerPhone,
    });

    const bookingId = newId("bkg");
    db.prepare(
      `INSERT INTO bookings
         (id, trip_id, buyer_phone, buyer_name, channel, agency_id, sold_by_user_id,
          cash_session_id, total_amount, currency, status, credit_applied, created_at, confirmed_at)
       VALUES (?, ?, ?, ?, 'GUICHET', ?, ?, ?, ?, ?, 'CONFIRME', 0, ?, ?)`,
    ).run(
      bookingId,
      params.tripId,
      params.buyerPhone,
      params.buyerName,
      params.actor.agencyId,
      params.actor.userId,
      params.cashSessionId,
      total,
      params.currency,
      nowIso(),
      nowIso(),
    );

    const seats = db
      .prepare(
        `SELECT * FROM trip_seats WHERE trip_id = ? AND lock_session_id = ? AND status = 'VERROUILLE'`,
      )
      .all(params.tripId, holdId) as Array<{ id: string; seat_number: string }>;
    const bySeat = new Map(seats.map((s) => [s.seat_number, s]));

    const tickets: TicketRow[] = [];
    for (const passenger of params.passengers) {
      const seat = bySeat.get(passenger.seatNumber);
      if (!seat) throw errors.conflict("SIEGE_INDISPONIBLE", `Siège ${passenger.seatNumber} indisponible.`);
      tickets.push(
        issueTicket(db, {
          bookingId,
          tripId: params.tripId,
          seat,
          passengerName: passenger.name,
          passengerPhone: passenger.phone || params.buyerPhone,
          priceAmount: unitPrice,
          priceCurrency: params.currency,
          agencyId: params.actor.agencyId,
        }),
      );
    }

    // §2.4 : « chaque billet crée un mouvement de caisse ».
    db.prepare(
      `INSERT INTO cash_movements
         (id, cash_session_id, booking_id, type, amount, currency, label, created_at)
       VALUES (?, ?, ?, 'VENTE', ?, ?, ?, ?)`,
    ).run(
      newId("cmv"),
      params.cashSessionId,
      bookingId,
      total,
      params.currency,
      `${params.passengers.length} billet(s) — ${tickets.map((t) => t.ticket_code).join(", ")}`,
      nowIso(),
    );

    // Le paiement espèces est tracé au même titre qu'un Mobile Money : la
    // réconciliation des recettes (§2.11) ne distingue pas les canaux.
    db.prepare(
      `INSERT INTO payments
         (id, booking_id, provider, provider_ref, idempotency_key, payer_phone,
          amount, currency, status, created_at, resolved_at)
       VALUES (?, ?, 'ESPECES', NULL, ?, ?, ?, ?, 'CONFIRME', ?, ?)`,
    ).run(
      newId("pay"),
      bookingId,
      params.clientOpId ?? `pos:${bookingId}`,
      params.buyerPhone,
      total,
      params.currency,
      nowIso(),
      nowIso(),
    );

    if (params.clientOpId) {
      db.prepare(
        `INSERT INTO sync_log
           (id, device_id, client_op_id, kind, payload_json, result, server_ref, client_time, server_time)
         VALUES (?, ?, ?, 'VENTE_POS', ?, 'APPLIQUE', ?, ?, ?)`,
      ).run(
        newId("syn"),
        params.deviceId ?? "inconnu",
        params.clientOpId,
        JSON.stringify({ tripId: params.tripId, seats: params.seatNumbers }),
        bookingId,
        params.clientTime ?? null,
        nowIso(),
      );
    }

    audit(
      {
        userId: params.actor.userId,
        role: params.actor.role,
        companyId: params.actor.companyId,
        action: "VENTE_GUICHET",
        entity: "booking",
        entityId: bookingId,
        after: {
          sieges: params.seatNumbers,
          montant: total,
          devise: params.currency,
          horsLigne: Boolean(params.clientOpId),
        },
        ip: params.ip,
        device: params.deviceId,
      },
      db,
    );

    return { booking: getBooking(bookingId, db), tickets };
  });
}

/** Verrouillage à l'intérieur d'une transaction déjà ouverte (vente guichet). */
function lockSeatsInline(
  db: Database,
  params: { tripId: string; seatNumbers: string[]; holdId: string; phone: string },
): void {
  for (const seatNumber of params.seatNumbers) {
    const seat = db
      .prepare(`SELECT * FROM trip_seats WHERE trip_id = ? AND seat_number = ?`)
      .get(params.tripId, seatNumber) as
      | { id: string; status: string; channel: Channel }
      | undefined;
    if (!seat) throw errors.notFound(`Siège ${seatNumber}`);
    if (seat.channel !== "GUICHET") {
      throw errors.conflict(
        "SIEGE_AUTRE_CANAL",
        `Le siège ${seatNumber} appartient au quota ${seat.channel}. Rééquilibrez l'allocation pour le vendre au guichet.`,
      );
    }
    if (seat.status !== "DISPONIBLE") {
      throw errors.conflict("SIEGE_INDISPONIBLE", `Le siège ${seatNumber} vient d'être pris.`);
    }
    db.prepare(
      `UPDATE trip_seats SET status = 'VERROUILLE', locked_until = NULL,
              lock_session_id = ?, lock_phone = ?
        WHERE id = ? AND status = 'DISPONIBLE'`,
    ).run(params.holdId, params.phone, seat.id);
  }
}

/** Réservations non payées dont le verrou a expiré. */
export function expireStaleBookings(db: Database = getDb()): number {
  releaseExpiredLocks(db);
  const stale = db
    .prepare(
      `SELECT b.id FROM bookings b
        WHERE b.status = 'EN_ATTENTE'
          AND NOT EXISTS (
            SELECT 1 FROM payments p
             WHERE p.booking_id = b.id AND p.status IN ('INITIE','INDETERMINE','CONFIRME')
          )
          AND NOT EXISTS (
            SELECT 1 FROM trip_seats s
             WHERE s.trip_id = b.trip_id AND s.status = 'VERROUILLE'
               AND s.lock_phone = b.buyer_phone
          )`,
    )
    .all() as { id: string }[];
  const update = db.prepare(`UPDATE bookings SET status = 'EXPIRE' WHERE id = ?`);
  for (const row of stale) update.run(row.id);
  return stale.length;
}

/** Trajets dont la vente reste ouverte, filtrés pour le guichet (§2.4.1). */
export function tripsForAgencyToday(
  agencyId: string,
  db: Database = getDb(),
): Array<{ id: string; departure_datetime: string; origin_city: string; destination_city: string; departure_mode: string; status: string; plate_number: string; category: string; disponibles: number }> {
  const from = new Date(Date.now() - 6 * 3_600_000).toISOString();
  const to = new Date(Date.now() + 36 * 3_600_000).toISOString();
  releaseExpiredLocks(db);
  return db
    .prepare(
      `SELECT t.id, t.departure_datetime, t.departure_mode, t.status,
              r.origin_city, r.destination_city, b.plate_number, b.category,
              (SELECT COUNT(*) FROM trip_seats s
                WHERE s.trip_id = t.id AND s.channel = 'GUICHET' AND s.status = 'DISPONIBLE') AS disponibles
         FROM trips t
         JOIN routes r ON r.id = t.route_id
         JOIN buses b ON b.id = t.bus_id
        WHERE t.origin_agency_id = ?
          AND t.status IN ('PLANIFIE','EN_VENTE')
          AND t.departure_datetime BETWEEN ? AND ?
        ORDER BY t.departure_datetime`,
    )
    .all(agencyId, from, to) as never;
}

export { hoursUntil };
