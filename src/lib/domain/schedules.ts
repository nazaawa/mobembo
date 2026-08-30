import type { DbHandle } from "@/lib/db";
import { getDb, tx } from "@/lib/db";
import { newId } from "@/lib/core/ids";
import { addDays, departureIso, isoWeekday, nowIso } from "@/lib/core/time";
import { errors } from "@/lib/core/errors";
import { audit } from "./audit";
import { companyAccess, hasModule } from "./access";
import type { VehicleType } from "./types";
import { parseDays } from "./schedule-format";

// Réexport de commodité : le domaine reste le point d'entrée unique côté
// serveur, les composants clients importent `schedule-format` directement.
export { JOURS, formatDays, parseDays } from "./schedule-format";

/**
 * Phase 1 — « Référencement et recherche ».
 *
 * Un `schedule` est un service régulier tel qu'une agence l'annonce déjà sur
 * son tableau : « Kinshasa → Matadi, 08:00, du lundi au samedi, 25 $, départ
 * au rond-point Ngaba ». Il n'exige ni bus immatriculé, ni plan de sièges, ni
 * paiement en ligne — c'est précisément ce qui permet à une agence d'être
 * utile aux voyageurs sans changer sa façon de travailler (note
 * fonctionnelle, §3.1 et §6).
 *
 * Le modèle complet (`trips`, `trip_seats`, billetterie, POS, contrôle) reste
 * intact à côté : une agence y passe quand elle le décide, pas avant.
 */

export type ScheduleStatus = "PUBLIE" | "SUSPENDU" | "ARCHIVE";


export interface ScheduleRow {
  id: string;
  company_id: string;
  agency_id: string | null;
  origin_city: string;
  destination_city: string;
  departure_time: string;
  days_of_week: string;
  price_usd: number | null;
  price_cdf: number | null;
  boarding_point: string | null;
  boarding_gps: string | null;
  vehicle_type: VehicleType;
  vehicle_label: string | null;
  duration_est_min: number | null;
  notes: string | null;
  booking_enabled: number;
  online_quota: number;
  status: ScheduleStatus;
  suspended_reason: string | null;
  created_at: string;
  updated_at: string;
}

export function runsOn(schedule: Pick<ScheduleRow, "days_of_week">, day: string): boolean {
  return parseDays(schedule.days_of_week).includes(isoWeekday(day));
}

function validate(input: {
  originCity: string;
  destinationCity: string;
  departureTime: string;
  days: number[];
  priceUsd: number | null;
  priceCdf: number | null;
  onlineQuota: number;
  bookingEnabled: boolean;
}): void {
  if (!input.originCity.trim() || !input.destinationCity.trim()) {
    throw errors.invalid("Indiquez la ville de départ et la ville d'arrivée.");
  }
  if (input.originCity.trim().toLowerCase() === input.destinationCity.trim().toLowerCase()) {
    throw errors.invalid("Le départ et l'arrivée ne peuvent pas être la même ville.");
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.departureTime)) {
    throw errors.invalid("L'heure de départ doit être au format 08:00.");
  }
  if (input.days.length === 0) {
    throw errors.invalid("Choisissez au moins un jour de circulation.");
  }
  // §4.3 : le prix est « indicatif », mais un horaire sans aucun prix n'aide
  // pas le voyageur à décider. Une seule devise suffit.
  if (input.priceUsd === null && input.priceCdf === null) {
    throw errors.invalid("Indiquez un prix, en dollars ou en francs.");
  }
  for (const price of [input.priceUsd, input.priceCdf]) {
    if (price !== null && (!Number.isInteger(price) || price <= 0)) {
      throw errors.invalid("Le prix doit être un montant positif.");
    }
  }
  if (!Number.isInteger(input.onlineQuota) || input.onlineQuota < 0 || input.onlineQuota > 200) {
    throw errors.invalid("Le nombre de places ouvertes doit être compris entre 0 et 200.");
  }
  // §12 : « Mobembo ne doit pas supposer que toute la capacité du véhicule est
  // disponible en ligne. » Ouvrir la réservation sans quota serait une
  // promesse vide affichée au voyageur.
  if (input.bookingEnabled && input.onlineQuota < 1) {
    throw errors.invalid(
      "Pour ouvrir la réservation, indiquez combien de places vous proposez sur Mobembo.",
    );
  }
}

/**
 * §29 : la réservation en ligne est la phase 2, et une agence n'y entre pas
 * seule. Le formulaire masque déjà la case, mais la règle vit ici : c'est le
 * seul endroit que traversent aussi l'API, le seed et les tests.
 */
async function assertReservationOuverte(
  companyId: string,
  bookingEnabled: boolean,
  db: DbHandle,
): Promise<void> {
  if (!bookingEnabled) return;
  const acces = await companyAccess(companyId, db);
  if (!hasModule(acces, "RESERVATION")) {
    throw errors.forbidden(
      "La réservation en ligne n'est pas ouverte pour cette agence. Contactez l'équipe Mobembo.",
    );
  }
}

export interface ScheduleInput {
  companyId: string;
  agencyId?: string | null;
  originCity: string;
  destinationCity: string;
  departureTime: string;
  days: number[];
  priceUsd?: number | null;
  priceCdf?: number | null;
  boardingPoint?: string | null;
  boardingGps?: string | null;
  vehicleType?: VehicleType;
  vehicleLabel?: string | null;
  durationEstMin?: number | null;
  notes?: string | null;
  bookingEnabled?: boolean;
  onlineQuota?: number;
  actor?: { userId: string; role: string };
}

const cleanCity = (value: string) => value.trim().replace(/\s+/g, " ");
const optional = (value: string | null | undefined) => value?.trim() || null;

export async function createSchedule(input: ScheduleInput): Promise<ScheduleRow> {
  const days = [...new Set(input.days)].sort((a, b) => a - b);
  const priceUsd = input.priceUsd ?? null;
  const priceCdf = input.priceCdf ?? null;
  const onlineQuota = input.onlineQuota ?? 0;
  const bookingEnabled = Boolean(input.bookingEnabled);
  validate({
    originCity: input.originCity,
    destinationCity: input.destinationCity,
    departureTime: input.departureTime,
    days,
    priceUsd,
    priceCdf,
    onlineQuota,
    bookingEnabled,
  });

  return tx(async (db) => {
    await assertReservationOuverte(input.companyId, bookingEnabled, db);
    const id = newId("sch");
    const now = nowIso();
    await db
      .prepare(
        `INSERT INTO schedules
         (id, company_id, agency_id, origin_city, destination_city, departure_time,
          days_of_week, price_usd, price_cdf, boarding_point, boarding_gps,
          vehicle_type, vehicle_label, duration_est_min, notes,
          booking_enabled, online_quota, status, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PUBLIE', ?, ?, ?)`,
      )
      .run(
        id,
        input.companyId,
        input.agencyId ?? null,
        cleanCity(input.originCity),
        cleanCity(input.destinationCity),
        input.departureTime,
        days.join(","),
        priceUsd,
        priceCdf,
        optional(input.boardingPoint),
        optional(input.boardingGps),
        input.vehicleType ?? "BUS",
        optional(input.vehicleLabel),
        input.durationEstMin ?? null,
        optional(input.notes),
        bookingEnabled ? 1 : 0,
        onlineQuota,
        input.actor?.userId ?? null,
        now,
        now,
      );
    if (input.actor) {
      await audit(
        {
          userId: input.actor.userId,
          role: input.actor.role,
          companyId: input.companyId,
          action: "PUBLICATION_HORAIRE",
          entity: "schedule",
          entityId: id,
          after: {
            axe: `${input.originCity} → ${input.destinationCity}`,
            heure: input.departureTime,
            jours: days,
            reservation: bookingEnabled,
            quota: onlineQuota,
          },
        },
        db,
      );
    }
    return (await db.prepare<ScheduleRow>(`SELECT * FROM schedules WHERE id = ?`).get(id))!;
  });
}

export async function getSchedule(id: string, db: DbHandle = getDb()): Promise<ScheduleRow> {
  const row = await db.prepare<ScheduleRow>(`SELECT * FROM schedules WHERE id = ?`).get(id);
  if (!row) throw errors.notFound("Horaire");
  return row;
}

export async function updateSchedule(
  scheduleId: string,
  input: Omit<ScheduleInput, "companyId"> & { companyId: string },
): Promise<ScheduleRow> {
  const days = [...new Set(input.days)].sort((a, b) => a - b);
  const priceUsd = input.priceUsd ?? null;
  const priceCdf = input.priceCdf ?? null;
  const onlineQuota = input.onlineQuota ?? 0;
  const bookingEnabled = Boolean(input.bookingEnabled);
  validate({
    originCity: input.originCity,
    destinationCity: input.destinationCity,
    departureTime: input.departureTime,
    days,
    priceUsd,
    priceCdf,
    onlineQuota,
    bookingEnabled,
  });

  return tx(async (db) => {
    const before = await getSchedule(scheduleId, db);
    if (before.company_id !== input.companyId) {
      throw errors.forbidden("Cet horaire appartient à une autre agence.");
    }
    await assertReservationOuverte(input.companyId, bookingEnabled, db);
    await db
      .prepare(
        `UPDATE schedules SET
           agency_id = ?, origin_city = ?, destination_city = ?, departure_time = ?,
           days_of_week = ?, price_usd = ?, price_cdf = ?, boarding_point = ?,
           boarding_gps = ?, vehicle_type = ?, vehicle_label = ?, duration_est_min = ?,
           notes = ?, booking_enabled = ?, online_quota = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        input.agencyId ?? null,
        cleanCity(input.originCity),
        cleanCity(input.destinationCity),
        input.departureTime,
        days.join(","),
        priceUsd,
        priceCdf,
        optional(input.boardingPoint),
        optional(input.boardingGps),
        input.vehicleType ?? "BUS",
        optional(input.vehicleLabel),
        input.durationEstMin ?? null,
        optional(input.notes),
        bookingEnabled ? 1 : 0,
        onlineQuota,
        nowIso(),
        scheduleId,
      );
    if (input.actor) {
      await audit(
        {
          userId: input.actor.userId,
          role: input.actor.role,
          companyId: input.companyId,
          action: "MODIFICATION_HORAIRE",
          entity: "schedule",
          entityId: scheduleId,
          before: { heure: before.departure_time, prixUsd: before.price_usd, quota: before.online_quota },
          after: { heure: input.departureTime, prixUsd: priceUsd, quota: onlineQuota },
        },
        db,
      );
    }
    return getSchedule(scheduleId, db);
  });
}

/**
 * §5.5 « Mise à jour simple » : « La modification d'un prix ou d'un horaire
 * doit être rapide. L'employé doit pouvoir mettre à jour une information en
 * quelques actions. » Ce chemin ne demande que ce qui change.
 */
export async function quickUpdateSchedule(params: {
  scheduleId: string;
  companyId: string;
  departureTime?: string;
  priceUsd?: number | null;
  priceCdf?: number | null;
  onlineQuota?: number;
  actor: { userId: string; role: string };
}): Promise<ScheduleRow> {
  return tx(async (db) => {
    const before = await getSchedule(params.scheduleId, db);
    if (before.company_id !== params.companyId) {
      throw errors.forbidden("Cet horaire appartient à une autre agence.");
    }
    const departureTime = params.departureTime ?? before.departure_time;
    const priceUsd = params.priceUsd === undefined ? before.price_usd : params.priceUsd;
    const priceCdf = params.priceCdf === undefined ? before.price_cdf : params.priceCdf;
    const onlineQuota = params.onlineQuota ?? before.online_quota;
    validate({
      originCity: before.origin_city,
      destinationCity: before.destination_city,
      departureTime,
      days: parseDays(before.days_of_week),
      priceUsd,
      priceCdf,
      onlineQuota,
      bookingEnabled: before.booking_enabled === 1,
    });
    await db
      .prepare(
        `UPDATE schedules SET departure_time = ?, price_usd = ?, price_cdf = ?, online_quota = ?, updated_at = ?
          WHERE id = ?`,
      )
      .run(departureTime, priceUsd, priceCdf, onlineQuota, nowIso(), params.scheduleId);
    await audit(
      {
        userId: params.actor.userId,
        role: params.actor.role,
        companyId: params.companyId,
        action: "MISE_A_JOUR_RAPIDE_HORAIRE",
        entity: "schedule",
        entityId: params.scheduleId,
        before: {
          heure: before.departure_time,
          prixUsd: before.price_usd,
          prixCdf: before.price_cdf,
          quota: before.online_quota,
        },
        after: { heure: departureTime, prixUsd: priceUsd, prixCdf: priceCdf, quota: onlineQuota },
      },
      db,
    );
    return getSchedule(params.scheduleId, db);
  });
}

/**
 * §6 : « Mobembo peut désactiver temporairement une information manifestement
 * incorrecte. » Un horaire suspendu disparaît de la recherche mais reste
 * visible et réactivable par l'agence.
 */
export async function setScheduleStatus(params: {
  scheduleId: string;
  companyId: string;
  status: ScheduleStatus;
  reason?: string | null;
  actor: { userId: string; role: string };
}): Promise<void> {
  await tx(async (db) => {
    const before = await getSchedule(params.scheduleId, db);
    if (before.company_id !== params.companyId && params.actor.role !== "SUPER_ADMIN") {
      throw errors.forbidden("Cet horaire appartient à une autre agence.");
    }
    if (params.status === "SUSPENDU" && !params.reason?.trim()) {
      throw errors.invalid("Indiquez pourquoi cet horaire est suspendu.");
    }
    await db
      .prepare(
        `UPDATE schedules SET status = ?, suspended_reason = ?, suspended_by = ?, updated_at = ?
          WHERE id = ?`,
      )
      .run(
        params.status,
        params.status === "SUSPENDU" ? params.reason!.trim() : null,
        params.status === "SUSPENDU" ? params.actor.userId : null,
        nowIso(),
        params.scheduleId,
      );
    await audit(
      {
        userId: params.actor.userId,
        role: params.actor.role,
        companyId: before.company_id,
        action: "STATUT_HORAIRE",
        entity: "schedule",
        entityId: params.scheduleId,
        before: { statut: before.status },
        after: { statut: params.status, motif: params.reason ?? null },
      },
      db,
    );
  });
}

/** Places encore libres sur un service, pour une date donnée. */
export interface ScheduleAvailability {
  quota: number;
  reservees: number;
  restantes: number;
}

export async function scheduleAvailability(
  scheduleId: string,
  travelDate: string,
  db: DbHandle = getDb(),
): Promise<ScheduleAvailability> {
  const schedule = await getSchedule(scheduleId, db);
  const row = await db
    .prepare<{ places: number | null }>(
      `SELECT SUM(seats) AS places FROM schedule_bookings
        WHERE schedule_id = ? AND travel_date = ? AND status = 'CONFIRMEE'`,
    )
    .get(scheduleId, travelDate);
  const reservees = row?.places ?? 0;
  const quota = schedule.booking_enabled === 1 ? schedule.online_quota : 0;
  return { quota, reservees, restantes: Math.max(0, quota - reservees) };
}

/** Services publiés par une compagnie, avec la charge de réservation du jour. */
export interface CompanyScheduleRow extends ScheduleRow {
  agence: string | null;
  reservationsAVenir: number;
  placesAVenir: number;
}

export async function companySchedules(
  companyId: string,
  db: DbHandle = getDb(),
): Promise<CompanyScheduleRow[]> {
  return db
    .prepare<CompanyScheduleRow>(
      `SELECT s.*, a.name AS agence,
              (SELECT COUNT(*) FROM schedule_bookings b
                WHERE b.schedule_id = s.id AND b.status = 'CONFIRMEE' AND b.departure_at >= ?) AS reservationsAVenir,
              (SELECT COALESCE(SUM(b.seats), 0) FROM schedule_bookings b
                WHERE b.schedule_id = s.id AND b.status = 'CONFIRMEE' AND b.departure_at >= ?) AS placesAVenir
         FROM schedules s
         LEFT JOIN agencies a ON a.id = s.agency_id
        WHERE s.company_id = ? AND s.status <> 'ARCHIVE'
        ORDER BY s.origin_city, s.destination_city, s.departure_time`,
    )
    .all(nowIso(), nowIso(), companyId);
}

/** Un résultat de recherche issu de la couche légère. */
export interface ScheduleSearchRow extends ScheduleRow {
  compagnie: string;
  company_slug: string | null;
  company_phone: string | null;
  company_whatsapp: string | null;
  company_kind: string;
  agence: string | null;
  placesReservees: number;
}

export async function searchSchedules(params: {
  origin: string;
  destination: string;
  day: string;
  db?: DbHandle;
}): Promise<ScheduleSearchRow[]> {
  const db = params.db ?? getDb();
  const weekday = String(isoWeekday(params.day));
  return db
    .prepare<ScheduleSearchRow>(
      `SELECT s.*, c.name AS compagnie, c.slug AS company_slug, c.phone AS company_phone,
              c.whatsapp AS company_whatsapp, c.kind AS company_kind, a.name AS agence,
              (SELECT COALESCE(SUM(b.seats), 0) FROM schedule_bookings b
                WHERE b.schedule_id = s.id AND b.travel_date = ? AND b.status = 'CONFIRMEE') AS placesReservees
         FROM schedules s
         JOIN companies c ON c.id = s.company_id
         LEFT JOIN agencies a ON a.id = s.agency_id
        WHERE LOWER(s.origin_city) = LOWER(?)
          AND LOWER(s.destination_city) = LOWER(?)
          AND s.status = 'PUBLIE'
          AND c.status = 'ACTIVE'
          AND FIND_IN_SET(?, s.days_of_week)
        ORDER BY s.departure_time`,
    )
    .all(params.day, params.origin, params.destination, weekday);
}

/** Services d'une agence, pour sa fiche publique (§4.4 « principaux trajets »). */
export async function publicSchedulesOfCompany(
  companyId: string,
  db: DbHandle = getDb(),
): Promise<Array<ScheduleRow & { agence: string | null }>> {
  return db
    .prepare<ScheduleRow & { agence: string | null }>(
      `SELECT s.*, a.name AS agence FROM schedules s
         LEFT JOIN agencies a ON a.id = s.agency_id
        WHERE s.company_id = ? AND s.status = 'PUBLIE'
        ORDER BY s.origin_city, s.destination_city, s.departure_time`,
    )
    .all(companyId);
}

export async function scheduleCities(db: DbHandle = getDb()): Promise<string[]> {
  const rows = await db
    .prepare<{ city: string }>(
      `SELECT s.origin_city AS city FROM schedules s
         JOIN companies c ON c.id = s.company_id
        WHERE s.status = 'PUBLIE' AND c.status = 'ACTIVE'
       UNION
       SELECT s.destination_city FROM schedules s
         JOIN companies c ON c.id = s.company_id
        WHERE s.status = 'PUBLIE' AND c.status = 'ACTIVE'`,
    )
    .all();
  return rows.map((row) => row.city);
}

/** Instant de départ annoncé pour une date donnée. */
export function scheduleDepartureIso(schedule: Pick<ScheduleRow, "departure_time">, day: string): string {
  return departureIso(day, schedule.departure_time);
}

/** Fiche publique d'un service régulier — §4.5 « Fiche trajet ». */
export interface PublicSchedule extends ScheduleRow {
  compagnie: string;
  company_slug: string | null;
  company_phone: string | null;
  company_whatsapp: string | null;
  company_kind: string;
  company_logo: string | null;
  agence: string | null;
  agence_ville: string | null;
  agence_adresse: string | null;
}

export async function publicScheduleById(
  id: string,
  db: DbHandle = getDb(),
): Promise<PublicSchedule | null> {
  const row = await db
    .prepare<PublicSchedule>(
      `SELECT s.*, c.name AS compagnie, c.slug AS company_slug, c.phone AS company_phone,
              c.whatsapp AS company_whatsapp, c.kind AS company_kind, c.logo AS company_logo,
              a.name AS agence, a.city AS agence_ville, a.address AS agence_adresse
         FROM schedules s
         JOIN companies c ON c.id = s.company_id
         LEFT JOIN agencies a ON a.id = s.agency_id
        WHERE s.id = ? AND c.status = 'ACTIVE' AND s.status <> 'ARCHIVE'`,
    )
    .get(id);
  return row ?? null;
}

/**
 * Prochaines dates de circulation d'un service, avec la disponibilité de
 * chacune. Un voyageur choisit d'abord un jour, et un jour sans départ ne doit
 * pas être proposé du tout.
 */
export interface ScheduleDay {
  date: string;
  depart: string;
  quota: number;
  reservees: number;
  restantes: number;
}

export async function upcomingScheduleDays(
  schedule: ScheduleRow,
  fromDay: string,
  count = 14,
  db: DbHandle = getDb(),
): Promise<ScheduleDay[]> {
  const jours = parseDays(schedule.days_of_week);
  const reservations = await db
    .prepare<{ travel_date: string; places: number }>(
      `SELECT travel_date, COALESCE(SUM(seats), 0) AS places FROM schedule_bookings
        WHERE schedule_id = ? AND status = 'CONFIRMEE' AND travel_date >= ?
        GROUP BY travel_date`,
    )
    .all(schedule.id, fromDay);
  const prises = new Map(reservations.map((row) => [row.travel_date, row.places]));

  const quota = schedule.booking_enabled === 1 ? schedule.online_quota : 0;
  const days: ScheduleDay[] = [];
  for (let offset = 0; days.length < count && offset < 60; offset++) {
    const date = addDays(fromDay, offset);
    if (!jours.includes(isoWeekday(date))) continue;
    const depart = departureIso(date, schedule.departure_time);
    if (new Date(depart).getTime() <= Date.now()) continue;
    const reservees = prises.get(date) ?? 0;
    days.push({ date, depart, quota, reservees, restantes: Math.max(0, quota - reservees) });
  }
  return days;
}
