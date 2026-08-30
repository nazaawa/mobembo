import type { DbHandle } from "@/lib/db";
import { getDb, tx } from "@/lib/db";
import { normalisePhone } from "@/lib/auth";
import { newId, newTicketCode } from "@/lib/core/ids";
import { departureIso, isoWeekday, nowIso, todayInKinshasa } from "@/lib/core/time";
import { errors } from "@/lib/core/errors";
import { queueSms, flushSmsQueue } from "@/lib/sms";
import { audit } from "./audit";
import { parseDays, type ScheduleRow } from "./schedules";

/**
 * Phase 2 — « Réservation ».
 *
 * §9.1 : « Permettre aux agences de proposer certaines places à la réservation
 * sur Mobembo sans les obliger à transférer toute leur billetterie. » La
 * réservation ne crée ni billet, ni siège, ni paiement : elle réserve une
 * place sur le quota que l'agence a explicitement ouvert pour ce départ.
 *
 * §12 : « Une place vendue sur Mobembo doit être automatiquement retirée du
 * quota disponible. » Le décompte se fait à la confirmation, immédiate, et le
 * quota se compte par (service, date) — jamais sur la capacité du véhicule,
 * que Mobembo ne connaît pas.
 */

export type ReservationStatus = "CONFIRMEE" | "ANNULEE" | "TERMINEE";

export const RESERVATION_STATUS_LABELS: Record<ReservationStatus, string> = {
  CONFIRMEE: "Confirmée",
  ANNULEE: "Annulée",
  TERMINEE: "Voyage passé",
};

/** Un même voyageur ne peut pas accaparer le quota d'un petit départ. */
const MAX_PLACES_PAR_RESERVATION = 5;
/** Réserver au-delà de trois mois n'a pas de sens sur un horaire indicatif. */
const HORIZON_JOURS = 90;

export interface ReservationRow {
  id: string;
  reference: string;
  schedule_id: string;
  company_id: string;
  travel_date: string;
  departure_at: string;
  passenger_name: string;
  passenger_phone: string;
  seats: number;
  note: string | null;
  status: ReservationStatus;
  cancelled_by: string | null;
  cancel_reason: string | null;
  price_usd: number | null;
  price_cdf: number | null;
  /** Phase 3 : SUR_PLACE | EN_ATTENTE | PAYEE | REMBOURSEE. */
  payment_status: "SUR_PLACE" | "EN_ATTENTE" | "PAYEE" | "REMBOURSEE";
  created_at: string;
  updated_at: string;
  cancelled_at: string | null;
}

export interface ReservationView extends ReservationRow {
  compagnie: string;
  company_slug: string | null;
  company_phone: string | null;
  company_whatsapp: string | null;
  origin_city: string;
  destination_city: string;
  departure_time: string;
  boarding_point: string | null;
  boarding_gps: string | null;
  agence: string | null;
  /** Phase 3 — présent dès qu'un billet numérique a été émis (§14.2). */
  ticket_id: string | null;
  ticket_code: string | null;
  ticket_status: string | null;
}

const VIEW_SELECT = `
  SELECT b.*, c.name AS compagnie, c.slug AS company_slug, c.phone AS company_phone,
         c.whatsapp AS company_whatsapp, s.origin_city, s.destination_city,
         s.departure_time, s.boarding_point, s.boarding_gps, a.name AS agence,
         t.id AS ticket_id, t.ticket_code, t.status AS ticket_status
    FROM schedule_bookings b
    JOIN schedules s ON s.id = b.schedule_id
    JOIN companies c ON c.id = b.company_id
    LEFT JOIN agencies a ON a.id = s.agency_id
    LEFT JOIN schedule_tickets t ON t.reservation_id = b.id`;

/**
 * §10.4 : un départ passé ne reste pas « confirmé » indéfiniment dans l'espace
 * du voyageur. Comme le reste du produit (§3.1 : aucune tâche de fond), le
 * basculement se fait à la lecture.
 */
export async function settleFinishedReservations(db: DbHandle = getDb()): Promise<number> {
  const result = await db
    .prepare(
      `UPDATE schedule_bookings SET status = 'TERMINEE', updated_at = ?
        WHERE status = 'CONFIRMEE' AND departure_at < ?`,
    )
    .run(nowIso(), nowIso());
  return result.changes;
}

export interface CreateReservationInput {
  scheduleId: string;
  travelDate: string;
  passengerName: string;
  passengerPhone: string;
  seats: number;
  note?: string | null;
}

export async function createReservation(
  input: CreateReservationInput,
): Promise<ReservationView> {
  const phone = normalisePhone(input.passengerPhone);
  const name = input.passengerName.trim();
  if (name.length < 2) throw errors.invalid("Indiquez le nom du voyageur.");
  if (!/^\+\d{9,15}$/.test(phone)) throw errors.invalid("Numéro de téléphone invalide.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.travelDate)) throw errors.invalid("Date de voyage invalide.");
  if (!Number.isInteger(input.seats) || input.seats < 1) {
    throw errors.invalid("Indiquez au moins une place.");
  }
  if (input.seats > MAX_PLACES_PAR_RESERVATION) {
    throw errors.invalid(
      `Au-delà de ${MAX_PLACES_PAR_RESERVATION} places, contactez directement l'agence.`,
    );
  }

  const id = await tx(async (db) => {
    // Le quota est la ressource disputée : deux voyageurs qui réservent la
    // dernière place au même instant doivent être départagés. Le verrou de
    // ligne sur le service sérialise le calcul, comme `trip_seats` le fait
    // pour la billetterie complète (§5.2).
    const schedule = await db
      .prepare<ScheduleRow & { compagnie: string; company_status: string }>(
        `SELECT s.*, c.name AS compagnie, c.status AS company_status
           FROM schedules s JOIN companies c ON c.id = s.company_id
          WHERE s.id = ? FOR UPDATE`,
      )
      .get(input.scheduleId);
    if (!schedule) throw errors.notFound("Horaire");
    if (schedule.status !== "PUBLIE" || schedule.company_status !== "ACTIVE") {
      throw errors.conflict("HORAIRE_INDISPONIBLE", "Ce départ n'est plus publié.");
    }
    if (schedule.booking_enabled !== 1 || schedule.online_quota < 1) {
      throw errors.conflict(
        "RESERVATION_FERMEE",
        "Cette agence ne prend pas encore de réservation en ligne sur ce départ. Appelez-la pour réserver.",
      );
    }
    if (!parseDays(schedule.days_of_week).includes(isoWeekday(input.travelDate))) {
      throw errors.invalid("Ce départ ne circule pas ce jour-là.");
    }

    const departureAt = departureIso(input.travelDate, schedule.departure_time);
    if (new Date(departureAt).getTime() <= Date.now()) {
      throw errors.conflict("DEPART_PASSE", "Ce départ est déjà passé. Choisissez une autre date.");
    }
    const horizon = Date.now() + HORIZON_JOURS * 86_400_000;
    if (new Date(departureAt).getTime() > horizon) {
      throw errors.invalid(`Les réservations ouvrent jusqu'à ${HORIZON_JOURS} jours à l'avance.`);
    }

    const doublon = await db
      .prepare<{ reference: string }>(
        `SELECT reference FROM schedule_bookings
          WHERE schedule_id = ? AND travel_date = ? AND passenger_phone = ? AND status = 'CONFIRMEE'`,
      )
      .get(input.scheduleId, input.travelDate, phone);
    if (doublon) {
      throw errors.conflict(
        "RESERVATION_EXISTANTE",
        `Vous avez déjà la réservation ${doublon.reference} sur ce départ. Annulez-la avant d'en créer une autre.`,
      );
    }

    const prises = await db
      .prepare<{ places: number | null }>(
        `SELECT SUM(seats) AS places FROM schedule_bookings
          WHERE schedule_id = ? AND travel_date = ? AND status = 'CONFIRMEE'`,
      )
      .get(input.scheduleId, input.travelDate);
    const restantes = schedule.online_quota - (prises?.places ?? 0);
    if (restantes <= 0) {
      throw errors.conflict(
        "QUOTA_EPUISE",
        "Toutes les places ouvertes en ligne sur ce départ sont prises. L'agence en garde d'autres au guichet.",
      );
    }
    if (input.seats > restantes) {
      throw errors.conflict(
        "QUOTA_INSUFFISANT",
        `Il ne reste que ${restantes} place${restantes > 1 ? "s" : ""} en ligne sur ce départ.`,
      );
    }

    const bookingId = newId("res");
    const reference = newTicketCode();
    const now = nowIso();
    await db
      .prepare(
        `INSERT INTO schedule_bookings
         (id, reference, schedule_id, company_id, travel_date, departure_at,
          passenger_name, passenger_phone, seats, note, status,
          price_usd, price_cdf, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CONFIRMEE', ?, ?, ?, ?)`,
      )
      .run(
        bookingId,
        reference,
        input.scheduleId,
        schedule.company_id,
        input.travelDate,
        departureAt,
        name,
        phone,
        input.seats,
        input.note?.trim() || null,
        schedule.price_usd,
        schedule.price_cdf,
        now,
        now,
      );

    const heure = schedule.departure_time;
    const lieu = schedule.boarding_point ? ` Départ : ${schedule.boarding_point}.` : "";
    await queueSms(
      db,
      phone,
      `MOBEMBO : reservation ${reference} confirmee. ${schedule.compagnie}, ` +
        `${schedule.origin_city} - ${schedule.destination_city}, ${input.travelDate} a ${heure}, ` +
        `${input.seats} place(s).${lieu} Payez sur place aupres de l'agence.`,
      "RESERVATION",
    );
    await audit(
      {
        role: "PASSAGER",
        companyId: schedule.company_id,
        action: "RESERVATION_HORAIRE",
        entity: "schedule_booking",
        entityId: bookingId,
        after: { reference, date: input.travelDate, places: input.seats },
      },
      db,
    );
    return bookingId;
  });

  await flushSmsQueue();
  return (await reservationById(id))!;
}

export async function reservationById(
  id: string,
  db: DbHandle = getDb(),
): Promise<ReservationView | null> {
  const row = await db.prepare<ReservationView>(`${VIEW_SELECT} WHERE b.id = ?`).get(id);
  return row ?? null;
}

export async function reservationByReference(
  reference: string,
  db: DbHandle = getDb(),
): Promise<ReservationView | null> {
  const row = await db
    .prepare<ReservationView>(`${VIEW_SELECT} WHERE b.reference = ?`)
    .get(reference.trim().toUpperCase());
  return row ?? null;
}

/**
 * §10.4 « Mes réservations » : en attente / confirmées / annulées / terminées.
 * La phase 2 n'a pas d'attente de paiement — « en attente » n'existe donc pas
 * encore, et il serait malhonnête d'afficher un onglet vide qui promet une
 * étape inexistante.
 */
export async function passengerReservations(
  phone: string,
  db: DbHandle = getDb(),
): Promise<ReservationView[]> {
  return db
    .prepare<ReservationView>(
      `${VIEW_SELECT} WHERE b.passenger_phone = ? ORDER BY b.departure_at DESC`,
    )
    .all(normalisePhone(phone));
}

/** §11.2 « Suivi des réservations » côté agence. */
export interface CompanyReservationFilters {
  companyId: string;
  scope?: "A_VENIR" | "TOUTES";
  scheduleId?: string | null;
}

export async function companyReservations(
  filters: CompanyReservationFilters,
  db: DbHandle = getDb(),
): Promise<ReservationView[]> {
  const aVenir = (filters.scope ?? "A_VENIR") === "A_VENIR";
  return db
    .prepare<ReservationView>(
      `${VIEW_SELECT}
        WHERE b.company_id = ?
          AND (? = 0 OR b.departure_at >= ?)
          AND (? IS NULL OR b.schedule_id = ?)
        ORDER BY b.departure_at ${aVenir ? "ASC" : "DESC"}
        LIMIT 200`,
    )
    .all(
      filters.companyId,
      aVenir ? 1 : 0,
      nowIso(),
      filters.scheduleId ?? null,
      filters.scheduleId ?? null,
    );
}

export async function cancelReservation(params: {
  reservationId: string;
  by: "VOYAGEUR" | "AGENCE";
  reason?: string | null;
  /** Preuve de propriété côté voyageur : le numéro de la session OTP. */
  phone?: string | null;
  companyId?: string | null;
  actor?: { userId: string; role: string };
}): Promise<ReservationView> {
  await tx(async (db) => {
    const booking = await db
      .prepare<ReservationRow>(`SELECT * FROM schedule_bookings WHERE id = ? FOR UPDATE`)
      .get(params.reservationId);
    if (!booking) throw errors.notFound("Réservation");
    if (params.by === "VOYAGEUR") {
      if (!params.phone || normalisePhone(params.phone) !== booking.passenger_phone) {
        throw errors.forbidden("Cette réservation appartient à un autre numéro.");
      }
    } else if (params.companyId && booking.company_id !== params.companyId) {
      throw errors.forbidden("Cette réservation appartient à une autre agence.");
    }
    if (booking.status === "ANNULEE") {
      throw errors.conflict("DEJA_ANNULEE", "Cette réservation est déjà annulée.");
    }
    if (booking.status === "TERMINEE" || new Date(booking.departure_at).getTime() <= Date.now()) {
      throw errors.conflict("DEPART_PASSE", "Ce départ est passé : la réservation ne s'annule plus.");
    }
    if (params.by === "AGENCE" && !params.reason?.trim()) {
      throw errors.invalid("Indiquez le motif communiqué au voyageur.");
    }

    const now = nowIso();
    await db
      .prepare(
        `UPDATE schedule_bookings
            SET status = 'ANNULEE', cancelled_by = ?, cancel_reason = ?, cancelled_at = ?, updated_at = ?
          WHERE id = ?`,
      )
      .run(params.by, params.reason?.trim() || null, now, now, params.reservationId);

    // §16 : « Les remboursements et annulations devront respecter les règles
    // définies par l'agence et Mobembo. » Ces règles n'existent pas encore :
    // le système n'en invente aucune. Il invalide le billet — un billet annulé
    // ne doit plus passer au contrôle — met le paiement en attente de
    // remboursement, et le fait remonter à l'agence, qui tranche. Rembourser
    // automatiquement sur une règle non écrite serait pire qu'une file
    // d'attente visible.
    if (booking.payment_status === "PAYEE") {
      await db
        .prepare(
          `UPDATE schedule_tickets SET status = 'ANNULE', updated_at = ?
            WHERE reservation_id = ? AND status IN ('VALIDE','UTILISE')`,
        )
        .run(now, params.reservationId);
      await db
        .prepare(
          `UPDATE schedule_payments SET status = 'A_REMBOURSER'
            WHERE reservation_id = ? AND status = 'CONFIRME'`,
        )
        .run(params.reservationId);
      await db
        .prepare(`UPDATE schedule_bookings SET payment_status = 'REMBOURSEE' WHERE id = ?`)
        .run(params.reservationId);
      await queueSms(
        db,
        booking.passenger_phone,
        `MOBEMBO : votre billet ${booking.reference} est annule. ` +
          `Le remboursement est traite par l'agence, qui vous recontacte.`,
        "REMBOURSEMENT",
      );
    }

    if (params.by === "AGENCE") {
      await queueSms(
        db,
        booking.passenger_phone,
        `MOBEMBO : votre reservation ${booking.reference} du ${booking.travel_date} a ete annulee par l'agence. ` +
          `Motif : ${params.reason!.trim()}`,
        "RESERVATION_ANNULEE",
      );
    }
    await audit(
      {
        userId: params.actor?.userId,
        role: params.actor?.role ?? "PASSAGER",
        companyId: booking.company_id,
        action: "ANNULATION_RESERVATION",
        entity: "schedule_booking",
        entityId: params.reservationId,
        after: { par: params.by, motif: params.reason ?? null },
      },
      db,
    );
  });
  await flushSmsQueue();
  return (await reservationById(params.reservationId))!;
}

/** §7 Indicateurs : recherche journalisée sans identifiant de personne. */
export async function recordSearch(params: {
  origin: string;
  destination: string;
  day: string;
  results: number;
  db?: DbHandle;
}): Promise<void> {
  const db = params.db ?? getDb();
  await db
    .prepare(
      `INSERT INTO search_events (id, origin_city, destination_city, travel_date, results_count, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(newId("sea"), params.origin, params.destination, params.day, params.results, nowIso());
}

/** Tableau de bord Phase 1/2 d'une compagnie. */
export interface ReservationSummary {
  aVenir: number;
  placesAVenir: number;
  aujourdhui: number;
  annulees7j: number;
}

export async function reservationSummary(
  companyId: string,
  db: DbHandle = getDb(),
): Promise<ReservationSummary> {
  const row = await db
    .prepare<ReservationSummary>(
      `SELECT
         COALESCE(SUM(CASE WHEN status = 'CONFIRMEE' AND departure_at >= ? THEN 1 ELSE 0 END), 0) AS aVenir,
         COALESCE(SUM(CASE WHEN status = 'CONFIRMEE' AND departure_at >= ? THEN seats ELSE 0 END), 0) AS placesAVenir,
         COALESCE(SUM(CASE WHEN status = 'CONFIRMEE' AND travel_date = ? THEN 1 ELSE 0 END), 0) AS aujourdhui,
         COALESCE(SUM(CASE WHEN status = 'ANNULEE' AND cancelled_at >= ? THEN 1 ELSE 0 END), 0) AS annulees7j
       FROM schedule_bookings WHERE company_id = ?`,
    )
    .get(
      nowIso(),
      nowIso(),
      todayInKinshasa(),
      new Date(Date.now() - 7 * 86_400_000).toISOString(),
      companyId,
    );
  return row ?? { aVenir: 0, placesAVenir: 0, aujourdhui: 0, annulees7j: 0 };
}
