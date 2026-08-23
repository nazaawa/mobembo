import type { Database } from "better-sqlite3";
import { getDb } from "@/lib/db";
import { newId, newTicketCode } from "@/lib/core/ids";
import { nowIso, formatDateTime } from "@/lib/core/time";
import { formatMoney, type Currency } from "@/lib/core/money";
import { errors } from "@/lib/core/errors";
import { buildQr } from "./qr";
import { queueSms } from "@/lib/sms";
import { audit, raiseAlert } from "./audit";
import { getCompany, getRoute, getTrip, type TicketRow, type TripSeatLike } from "./repo";

/**
 * Émission d'un billet. Toujours appelée à l'intérieur d'une transaction
 * ouverte par l'appelant : un billet, son siège et son mouvement de caisse
 * sont indissociables.
 */
export interface IssueTicketInput {
  bookingId: string;
  tripId: string;
  seat: TripSeatLike;
  passengerName: string;
  passengerPhone: string;
  priceAmount: number;
  priceCurrency: Currency;
  /** Renseigné pour une vente guichet : déclenche la numérotation séquentielle. */
  agencyId?: string | null;
  parentTicketId?: string | null;
}

/**
 * §2.4 : « Numérotation séquentielle et continue par agence. Un trou dans la
 * séquence remonte automatiquement au gérant. »
 *
 * Le compteur vit sur la ligne `agencies` et s'incrémente dans la même
 * transaction que le billet : deux guichetiers ne peuvent pas obtenir le même
 * numéro, et un rollback ne laisse pas de trou.
 */
function nextSequence(db: Database, agencyId: string): number {
  db.prepare(`UPDATE agencies SET ticket_sequence = ticket_sequence + 1 WHERE id = ?`).run(
    agencyId,
  );
  const row = db.prepare(`SELECT ticket_sequence FROM agencies WHERE id = ?`).get(agencyId) as
    | { ticket_sequence: number }
    | undefined;
  if (!row) throw errors.notFound("Agence");
  return row.ticket_sequence;
}

export function issueTicket(db: Database, input: IssueTicketInput): TicketRow {
  const trip = getTrip(input.tripId, db);
  const company = getCompany(trip.company_id, db);

  const id = newId("tkt");
  const ticketCode = newTicketCode();
  const qr = buildQr(
    { ticketId: id, tripId: input.tripId, seat: input.seat.seat_number },
    company.qr_secret,
  );
  const sequence = input.agencyId ? nextSequence(db, input.agencyId) : null;
  const timestamp = nowIso();

  db.prepare(
    `INSERT INTO tickets
       (id, booking_id, trip_seat_id, trip_id, passenger_name, passenger_phone,
        ticket_code, sequence_number, agency_id, qr_signature, status,
        price_amount, price_currency, parent_ticket_id, resold_count, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'EMIS', ?, ?, ?, 0, ?, ?)`,
  ).run(
    id,
    input.bookingId,
    input.seat.id,
    input.tripId,
    input.passengerName,
    input.passengerPhone,
    ticketCode,
    sequence,
    input.agencyId ?? null,
    qr,
    input.priceAmount,
    input.priceCurrency,
    input.parentTicketId ?? null,
    timestamp,
    timestamp,
  );

  // §2.8 : le siège passe VERROUILLE → VENDU dans la même transaction.
  db.prepare(
    `UPDATE trip_seats
        SET status = 'VENDU', locked_until = NULL, lock_session_id = NULL, lock_phone = NULL
      WHERE id = ?`,
  ).run(input.seat.id);

  const route = getRoute(trip.route_id, db);
  queueSms(
    db,
    input.passengerPhone,
    `MOBEMBO ${ticketCode} — ${route.origin_city}>${route.destination_city}, ` +
      `${formatDateTime(trip.departure_datetime)}, siege ${input.seat.seat_number}, ` +
      `${company.name}. Montant ${formatMoney(input.priceAmount, input.priceCurrency)}. ` +
      `Presentez ce code a l'embarquement.`,
    "BILLET_EMIS",
  );

  return db.prepare(`SELECT * FROM tickets WHERE id = ?`).get(id) as TicketRow;
}

/**
 * §2.4 / §2.11 : contrôle de continuité de la séquence d'une agence. Un trou
 * signifie qu'un billet a été émis puis effacé hors système, ou qu'un carnet
 * parallèle circule.
 */
export function detectSequenceGaps(
  agencyId: string,
  db: Database = getDb(),
): { gaps: number[]; issued: number; expected: number } {
  const rows = db
    .prepare(
      `SELECT sequence_number FROM tickets
        WHERE agency_id = ? AND sequence_number IS NOT NULL
        ORDER BY sequence_number`,
    )
    .all(agencyId) as { sequence_number: number }[];

  const gaps: number[] = [];
  let expected = 1;
  for (const row of rows) {
    while (expected < row.sequence_number) {
      gaps.push(expected);
      expected++;
    }
    expected = row.sequence_number + 1;
  }

  if (gaps.length > 0) {
    const already = db
      .prepare(`SELECT COUNT(*) AS n FROM alerts WHERE kind = 'TROU_SEQUENCE' AND agency_id = ?`)
      .get(agencyId) as { n: number };
    if (already.n === 0) {
      const agency = db.prepare(`SELECT company_id FROM agencies WHERE id = ?`).get(agencyId) as
        | { company_id: string }
        | undefined;
      raiseAlert(
        {
          kind: "TROU_SEQUENCE",
          severity: "BLOQUANTE",
          companyId: agency?.company_id ?? null,
          agencyId,
          reference: agencyId,
          body: `Trou dans la séquence de billets : numéro(s) ${gaps.join(", ")} manquant(s).`,
        },
        db,
      );
    }
  }

  return { gaps, issued: rows.length, expected: expected - 1 };
}

/**
 * §2.4 : « Le guichetier ne peut pas annuler une vente. Seul le gérant
 * d'agence le peut, avec motif obligatoire et journalisation. »
 */
export function cancelTicketByManager(params: {
  ticketId: string;
  reason: string;
  actor: { userId: string; role: string; companyId?: string | null };
  ip?: string | null;
  device?: string | null;
}): TicketRow {
  const db = getDb();
  if (!params.reason.trim()) {
    throw errors.invalid("Le motif d'annulation est obligatoire.");
  }
  const run = db.transaction(() => {
    const ticket = db.prepare(`SELECT * FROM tickets WHERE id = ?`).get(params.ticketId) as
      | TicketRow
      | undefined;
    if (!ticket) throw errors.notFound("Billet");
    if (ticket.status === "EMBARQUE") {
      throw errors.conflict("BILLET_EMBARQUE", "Un billet déjà embarqué ne s'annule pas.");
    }
    if (["ANNULE", "ANNULE_REVENDU", "TRANSFERE"].includes(ticket.status)) {
      throw errors.conflict("BILLET_DEJA_CLOS", "Ce billet est déjà clos.");
    }

    db.prepare(`UPDATE tickets SET status = 'ANNULE', updated_at = ? WHERE id = ?`).run(
      nowIso(),
      ticket.id,
    );
    // §2.8 : ANNULE → DISPONIBLE, le siège retourne au stock de son canal.
    db.prepare(
      `UPDATE trip_seats SET status = 'DISPONIBLE', locked_until = NULL,
              lock_session_id = NULL, lock_phone = NULL
        WHERE id = ?`,
    ).run(ticket.trip_seat_id);
    db.prepare(`UPDATE resale_listings SET status = 'RETIREE' WHERE ticket_id = ? AND status = 'ACTIVE'`).run(
      ticket.id,
    );

    audit(
      {
        userId: params.actor.userId,
        role: params.actor.role,
        companyId: params.actor.companyId,
        action: "ANNULATION_BILLET",
        entity: "ticket",
        entityId: ticket.id,
        before: { status: ticket.status },
        after: { status: "ANNULE", motif: params.reason },
        ip: params.ip,
        device: params.device,
      },
      db,
    );

    queueSms(
      db,
      ticket.passenger_phone,
      `MOBEMBO : votre billet ${ticket.ticket_code} a ete annule par l'agence. Motif : ${params.reason}.`,
      "ANNULATION",
    );

    detectAbnormalCancellations(db, params.actor.userId);

    return db.prepare(`SELECT * FROM tickets WHERE id = ?`).get(ticket.id) as TicketRow;
  });
  return run.immediate();
}

/**
 * §2.11 : « annulations anormalement nombreuses par un même agent ». Le seuil
 * est volontairement grossier — l'alerte déclenche un regard humain, pas une
 * sanction automatique.
 */
const ABNORMAL_CANCEL_THRESHOLD = 5;

function detectAbnormalCancellations(db: Database, userId: string): void {
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM audit_log
        WHERE user_id = ? AND action = 'ANNULATION_BILLET' AND created_at >= ?`,
    )
    .get(userId, since) as { n: number };
  if (row.n >= ABNORMAL_CANCEL_THRESHOLD) {
    const already = db
      .prepare(
        `SELECT COUNT(*) AS n FROM alerts
          WHERE kind = 'ANNULATIONS_ANORMALES' AND reference = ? AND created_at >= ?`,
      )
      .get(userId, since) as { n: number };
    if (already.n === 0) {
      raiseAlert(
        {
          kind: "ANNULATIONS_ANORMALES",
          reference: userId,
          body: `${row.n} annulations en 24 h par le même agent.`,
        },
        db,
      );
    }
  }
}

/**
 * §2.9 : « Un billet passe à EXPIRE si et seulement si le trajet est marqué
 * parti et qu'aucun scan n'est enregistré. Le départ effectif fait foi. »
 */
export function expireNoShows(tripId: string, db: Database = getDb()): number {
  const trip = getTrip(tripId, db);
  if (!trip.departed_at) {
    throw errors.conflict(
      "TRAJET_NON_PARTI",
      "Le départ effectif n'est pas enregistré : aucun no-show ne peut être constaté.",
    );
  }
  const result = db
    .prepare(
      `UPDATE tickets
          SET status = 'EXPIRE', updated_at = ?
        WHERE trip_id = ? AND status IN ('EMIS','EN_REVENTE')
          AND NOT EXISTS (
            SELECT 1 FROM boarding_scans s
             WHERE s.ticket_id = tickets.id AND s.result = 'ACCEPTE'
          )`,
    )
    .run(nowIso(), tripId);
  db.prepare(
    `UPDATE resale_listings SET status = 'EXPIREE' WHERE trip_id = ? AND status = 'ACTIVE'`,
  ).run(tripId);
  return result.changes;
}
