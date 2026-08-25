import type { DbHandle } from "@/lib/db";
import { getDb, tx } from "@/lib/db";
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
async function nextSequence(db: DbHandle, agencyId: string): Promise<number> {
  await db
    .prepare(`UPDATE agencies SET ticket_sequence = ticket_sequence + 1 WHERE id = ?`)
    .run(agencyId);
  const row = await db
    .prepare<{ ticket_sequence: number }>(`SELECT ticket_sequence FROM agencies WHERE id = ?`)
    .get(agencyId);
  if (!row) throw errors.notFound("Agence");
  return row.ticket_sequence;
}

export async function issueTicket(db: DbHandle, input: IssueTicketInput): Promise<TicketRow> {
  const trip = await getTrip(input.tripId, db);
  const company = await getCompany(trip.company_id, db);

  const id = newId("tkt");
  const ticketCode = newTicketCode();
  const qr = buildQr(
    { ticketId: id, tripId: input.tripId, seat: input.seat.seat_number },
    company.qr_secret,
  );
  const sequence = input.agencyId ? await nextSequence(db, input.agencyId) : null;
  const timestamp = nowIso();

  await db
    .prepare(
      `INSERT INTO tickets
       (id, booking_id, trip_seat_id, trip_id, passenger_name, passenger_phone,
        ticket_code, sequence_number, agency_id, qr_signature, status,
        price_amount, price_currency, parent_ticket_id, resold_count, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'EMIS', ?, ?, ?, 0, ?, ?)`,
    )
    .run(
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
  await db
    .prepare(
      `UPDATE trip_seats
        SET status = 'VENDU', locked_until = NULL, lock_session_id = NULL, lock_phone = NULL
      WHERE id = ?`,
    )
    .run(input.seat.id);

  const route = await getRoute(trip.route_id, db);
  await queueSms(
    db,
    input.passengerPhone,
    `MOBEMBO ${ticketCode} — ${route.origin_city}>${route.destination_city}, ` +
      `${formatDateTime(trip.departure_datetime)}, siege ${input.seat.seat_number}, ` +
      `${company.name}. Montant ${formatMoney(input.priceAmount, input.priceCurrency)}. ` +
      `Presentez ce code a l'embarquement.`,
    "BILLET_EMIS",
  );

  return (await db.prepare<TicketRow>(`SELECT * FROM tickets WHERE id = ?`).get(id)) as TicketRow;
}

/**
 * §2.4 / §2.11 : contrôle de continuité de la séquence d'une agence. Un trou
 * signifie qu'un billet a été émis puis effacé hors système, ou qu'un carnet
 * parallèle circule.
 */
export async function detectSequenceGaps(
  agencyId: string,
  db: DbHandle = getDb(),
): Promise<{ gaps: number[]; issued: number; expected: number }> {
  const rows = await db
    .prepare<{ sequence_number: number }>(
      `SELECT sequence_number FROM tickets
        WHERE agency_id = ? AND sequence_number IS NOT NULL
        ORDER BY sequence_number`,
    )
    .all(agencyId);

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
    const already = await db
      .prepare<{ n: number }>(
        `SELECT COUNT(*) AS n FROM alerts WHERE kind = 'TROU_SEQUENCE' AND agency_id = ?`,
      )
      .get(agencyId);
    if ((already?.n ?? 0) === 0) {
      const agency = await db
        .prepare<{ company_id: string }>(`SELECT company_id FROM agencies WHERE id = ?`)
        .get(agencyId);
      await raiseAlert(
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
export async function cancelTicketByManager(params: {
  ticketId: string;
  reason: string;
  actor: { userId: string; role: string; companyId?: string | null };
  ip?: string | null;
  device?: string | null;
}): Promise<TicketRow> {
  if (!params.reason.trim()) {
    throw errors.invalid("Le motif d'annulation est obligatoire.");
  }
  return tx(async (db) => {
    const ticket = await db.prepare<TicketRow>(`SELECT * FROM tickets WHERE id = ?`).get(params.ticketId);
    if (!ticket) throw errors.notFound("Billet");
    if (ticket.status === "EMBARQUE") {
      throw errors.conflict("BILLET_EMBARQUE", "Un billet déjà embarqué ne s'annule pas.");
    }
    if (["ANNULE", "ANNULE_REVENDU", "TRANSFERE"].includes(ticket.status)) {
      throw errors.conflict("BILLET_DEJA_CLOS", "Ce billet est déjà clos.");
    }

    await db
      .prepare(`UPDATE tickets SET status = 'ANNULE', updated_at = ? WHERE id = ?`)
      .run(nowIso(), ticket.id);
    // §2.8 : ANNULE → DISPONIBLE, le siège retourne au stock de son canal.
    await db
      .prepare(
        `UPDATE trip_seats SET status = 'DISPONIBLE', locked_until = NULL,
              lock_session_id = NULL, lock_phone = NULL
        WHERE id = ?`,
      )
      .run(ticket.trip_seat_id);
    await db
      .prepare(`UPDATE resale_listings SET status = 'RETIREE' WHERE ticket_id = ? AND status = 'ACTIVE'`)
      .run(ticket.id);

    await audit(
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

    await queueSms(
      db,
      ticket.passenger_phone,
      `MOBEMBO : votre billet ${ticket.ticket_code} a ete annule par l'agence. Motif : ${params.reason}.`,
      "ANNULATION",
    );

    await detectAbnormalCancellations(db, params.actor.userId);

    return (await db.prepare<TicketRow>(`SELECT * FROM tickets WHERE id = ?`).get(ticket.id)) as TicketRow;
  });
}

/**
 * §2.11 : « annulations anormalement nombreuses par un même agent ». Le seuil
 * est volontairement grossier — l'alerte déclenche un regard humain, pas une
 * sanction automatique.
 */
const ABNORMAL_CANCEL_THRESHOLD = 5;

async function detectAbnormalCancellations(db: DbHandle, userId: string): Promise<void> {
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const row = await db
    .prepare<{ n: number }>(
      `SELECT COUNT(*) AS n FROM audit_log
        WHERE user_id = ? AND action = 'ANNULATION_BILLET' AND created_at >= ?`,
    )
    .get(userId, since);
  if ((row?.n ?? 0) >= ABNORMAL_CANCEL_THRESHOLD) {
    const already = await db
      .prepare<{ n: number }>(
        `SELECT COUNT(*) AS n FROM alerts
          WHERE kind = 'ANNULATIONS_ANORMALES' AND reference = ? AND created_at >= ?`,
      )
      .get(userId, since);
    if ((already?.n ?? 0) === 0) {
      await raiseAlert(
        {
          kind: "ANNULATIONS_ANORMALES",
          reference: userId,
          body: `${row?.n ?? 0} annulations en 24 h par le même agent.`,
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
export async function expireNoShows(tripId: string, db: DbHandle = getDb()): Promise<number> {
  const trip = await getTrip(tripId, db);
  if (!trip.departed_at) {
    throw errors.conflict(
      "TRAJET_NON_PARTI",
      "Le départ effectif n'est pas enregistré : aucun no-show ne peut être constaté.",
    );
  }
  const result = await db
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
  await db
    .prepare(`UPDATE resale_listings SET status = 'EXPIREE' WHERE trip_id = ? AND status = 'ACTIVE'`)
    .run(tripId);
  return result.changes;
}
