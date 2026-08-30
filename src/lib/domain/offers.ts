import type { DbHandle } from "@/lib/db";
import { getDb } from "@/lib/db";
import { dayBounds, departureIso } from "@/lib/core/time";
import { knownCities as tripCities, searchTrips } from "./planning";
import { scheduleCities, searchSchedules } from "./schedules";
import type { BusCategory, VehicleType } from "./types";

/**
 * Une recherche, deux sources.
 *
 * Mobembo se construit par phases, et une agence ne doit jamais avoir à
 * choisir entre « tout numériser » et « ne pas exister ». Le voyageur, lui,
 * n'a pas à connaître cette différence : il cherche un départ. Ce module fond
 * les deux modèles dans une seule liste ordonnée par heure, en gardant
 * explicite ce que chaque offre permet réellement de faire.
 *
 * - `SIEGE`   — trajet complet : plan de sièges, paiement, billet QR (phases 3+).
 * - `PLACES`  — service régulier avec un quota ouvert à la réservation (phase 2).
 * - `CONTACT` — service régulier publié pour information : on appelle l'agence (phase 1).
 */
export type OfferKind = "TRAJET" | "HORAIRE";
export type BookingMode = "SIEGE" | "PLACES" | "CONTACT";

export interface TravelOffer {
  kind: OfferKind;
  id: string;
  href: string;
  compagnie: string;
  companyId: string;
  companySlug: string | null;
  companyPhone: string | null;
  companyWhatsapp: string | null;
  origine: string;
  destination: string;
  /** Instant de départ annoncé, en ISO. */
  depart: string;
  dureeEstimeeMin: number | null;
  prixUsd: number | null;
  prixCdf: number | null;
  /** Phase 1 : le prix publié est indicatif, il n'engage pas de paiement. */
  prixIndicatif: boolean;
  categorie: BusCategory | null;
  vehiculeType: VehicleType;
  vehiculeLabel: string | null;
  bookingMode: BookingMode;
  /** Places encore réservables en ligne, ou `null` si la notion ne s'applique pas. */
  placesDisponibles: number | null;
  placesOffertes: number | null;
  placesRemisesEnVente: number;
  pointEmbarquement: string | null;
  pointGps: string | null;
  agence: string | null;
  notes: string | null;
  /**
   * §6 : toute information *publiée* affiche sa date de dernière mise à jour.
   * `null` pour un trajet complet : sa disponibilité est lue en direct dans la
   * base au moment de la recherche, il n'y a pas d'information à dater.
   */
  misAJour: string | null;
}

export async function searchOffers(params: {
  origin: string;
  destination: string;
  day: string;
  db?: DbHandle;
}): Promise<TravelOffer[]> {
  const [trips, schedules] = await Promise.all([
    searchTrips(params),
    searchSchedules(params),
  ]);

  const offers: TravelOffer[] = [];

  for (const trip of trips) {
    offers.push({
      kind: "TRAJET",
      id: trip.tripId,
      href: `/trajet/${trip.tripId}`,
      compagnie: trip.compagnie,
      companyId: trip.companyId,
      companySlug: trip.companySlug,
      companyPhone: null,
      companyWhatsapp: null,
      origine: trip.origine,
      destination: trip.destination,
      depart: trip.depart,
      dureeEstimeeMin: trip.dureeEstimeeMin,
      prixUsd: trip.prixUsd,
      prixCdf: trip.prixCdf,
      prixIndicatif: false,
      categorie: trip.categorie,
      vehiculeType: trip.vehiculeType,
      vehiculeLabel: null,
      bookingMode: "SIEGE",
      placesDisponibles: trip.placesEnLigne,
      placesOffertes: null,
      placesRemisesEnVente: trip.placesRemisesEnVente,
      pointEmbarquement: null,
      pointGps: null,
      agence: null,
      notes: null,
      misAJour: null,
    });
  }

  // Un service régulier dont l'agence a aussi programmé le trajet complet
  // apparaîtrait deux fois pour le même départ. Le trajet complet gagne : il
  // porte la réservation de siège, donc plus de service rendu au voyageur.
  const departsCouverts = new Set(
    trips.map((trip) => `${trip.companyId}|${new Date(trip.depart).toISOString()}`),
  );

  for (const schedule of schedules) {
    const depart = departureIso(params.day, schedule.departure_time);
    if (departsCouverts.has(`${schedule.company_id}|${depart}`)) continue;

    const reservable = schedule.booking_enabled === 1 && schedule.online_quota > 0;
    const restantes = reservable
      ? Math.max(0, schedule.online_quota - schedule.placesReservees)
      : null;

    offers.push({
      kind: "HORAIRE",
      id: schedule.id,
      href: `/horaire/${schedule.id}?date=${params.day}`,
      compagnie: schedule.compagnie,
      companyId: schedule.company_id,
      companySlug: schedule.company_slug,
      companyPhone: schedule.company_phone,
      companyWhatsapp: schedule.company_whatsapp,
      origine: schedule.origin_city,
      destination: schedule.destination_city,
      depart,
      dureeEstimeeMin: schedule.duration_est_min,
      prixUsd: schedule.price_usd,
      prixCdf: schedule.price_cdf,
      prixIndicatif: true,
      categorie: null,
      vehiculeType: schedule.vehicle_type,
      vehiculeLabel: schedule.vehicle_label,
      bookingMode: reservable ? "PLACES" : "CONTACT",
      placesDisponibles: restantes,
      placesOffertes: reservable ? schedule.online_quota : null,
      placesRemisesEnVente: 0,
      pointEmbarquement: schedule.boarding_point,
      pointGps: schedule.boarding_gps,
      agence: schedule.agence,
      notes: schedule.notes,
      misAJour: schedule.updated_at,
    });
  }

  return offers.sort((a, b) => new Date(a.depart).getTime() - new Date(b.depart).getTime());
}

/** Villes proposées à la recherche : les deux sources réunies. */
export async function searchableCities(db: DbHandle = getDb()): Promise<string[]> {
  const [routes, schedules] = await Promise.all([tripCities(db), scheduleCities(db)]);
  return [...new Set([...routes, ...schedules])].sort((a, b) => a.localeCompare(b, "fr"));
}

export interface AxeSummary {
  origine: string;
  destination: string;
  compagnies: number;
  departs: number;
  prixMinimumUsd: number | null;
  reservationEnLigne: boolean;
}

/**
 * Les axes réellement couverts, tous modèles confondus. Sert l'accueil : le
 * voyageur doit voir ce qui existe avant de savoir quoi chercher.
 */
export async function coveredAxes(
  day: string,
  limit = 6,
  db: DbHandle = getDb(),
): Promise<AxeSummary[]> {
  // Le tableau d'accueil couvre les deux semaines à venir plutôt que la seule
  // journée : un axe desservi trois fois par semaine existe, et l'annoncer
  // « prix sur demande » parce qu'il ne roule pas aujourd'hui serait faux.
  const { start } = dayBounds(day);
  const horizon = new Date(new Date(start).getTime() + 14 * 86_400_000).toISOString();

  const [depuisHoraires, depuisTrajets] = await Promise.all([
    db
      .prepare<{
        origine: string;
        destination: string;
        compagnies: number;
        departs: number;
        prixMinimumUsd: number | null;
        reservationEnLigne: number;
      }>(
        `SELECT s.origin_city AS origine, s.destination_city AS destination,
                COUNT(DISTINCT s.company_id) AS compagnies,
                COUNT(*) AS departs,
                MIN(s.price_usd) AS prixMinimumUsd,
                MAX(s.booking_enabled) AS reservationEnLigne
           FROM schedules s
           JOIN companies c ON c.id = s.company_id AND c.status = 'ACTIVE'
          WHERE s.status = 'PUBLIE'
          GROUP BY s.origin_city, s.destination_city`,
      )
      .all(),
    db
      .prepare<{
        origine: string;
        destination: string;
        compagnies: number;
        departs: number;
        prixMinimumUsd: number | null;
      }>(
        `SELECT r.origin_city AS origine, r.destination_city AS destination,
                COUNT(DISTINCT t.company_id) AS compagnies,
                COUNT(DISTINCT t.id) AS departs,
                MIN(p.price_usd) AS prixMinimumUsd
           FROM trips t
           JOIN routes r ON r.id = t.route_id
           JOIN companies c ON c.id = t.company_id AND c.status = 'ACTIVE'
           JOIN buses b ON b.id = t.bus_id
           LEFT JOIN trip_prices p ON p.trip_id = t.id AND p.category = b.category
          WHERE t.status IN ('PLANIFIE','EN_VENTE')
            AND t.departure_mode = 'HORAIRE_FIXE'
            AND t.departure_datetime >= ? AND t.departure_datetime < ?
          GROUP BY r.origin_city, r.destination_city`,
      )
      .all(start, horizon),
  ]);

  const merged = new Map<string, AxeSummary>();
  for (const row of depuisHoraires) {
    merged.set(`${row.origine}|${row.destination}`, {
      origine: row.origine,
      destination: row.destination,
      compagnies: row.compagnies,
      departs: row.departs,
      prixMinimumUsd: row.prixMinimumUsd,
      reservationEnLigne: row.reservationEnLigne === 1,
    });
  }
  for (const row of depuisTrajets) {
    const key = `${row.origine}|${row.destination}`;
    const existing = merged.get(key);
    if (existing) {
      existing.departs += row.departs;
      existing.compagnies += row.compagnies;
      // Un trajet complet est par construction réservable en ligne.
      existing.reservationEnLigne = true;
      if (row.prixMinimumUsd !== null) {
        existing.prixMinimumUsd =
          existing.prixMinimumUsd === null
            ? row.prixMinimumUsd
            : Math.min(existing.prixMinimumUsd, row.prixMinimumUsd);
      }
    } else {
      merged.set(key, {
        origine: row.origine,
        destination: row.destination,
        compagnies: row.compagnies,
        departs: row.departs,
        prixMinimumUsd: row.prixMinimumUsd,
        reservationEnLigne: true,
      });
    }
  }

  return [...merged.values()]
    .sort((a, b) => b.departs - a.departs || a.origine.localeCompare(b.origine, "fr"))
    .slice(0, limit);
}

/** §7 Indicateurs Phase 1, affichés dans l'administration. */
export interface PlatformCoverage {
  agences: number;
  agencesActives: number;
  horaires: number;
  villes: number;
  reservations30j: number;
  recherches30j: number;
}

export async function platformCoverage(db: DbHandle = getDb()): Promise<PlatformCoverage> {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const row = await db
    .prepare<PlatformCoverage>(
      `SELECT
         (SELECT COUNT(*) FROM companies WHERE status = 'ACTIVE') AS agences,
         (SELECT COUNT(DISTINCT company_id) FROM schedules WHERE status = 'PUBLIE') AS agencesActives,
         (SELECT COUNT(*) FROM schedules WHERE status = 'PUBLIE') AS horaires,
         (SELECT COUNT(*) FROM (
             SELECT origin_city AS v FROM schedules WHERE status = 'PUBLIE'
             UNION SELECT destination_city FROM schedules WHERE status = 'PUBLIE'
             UNION SELECT origin_city FROM routes
             UNION SELECT destination_city FROM routes
           ) villes) AS villes,
         (SELECT COUNT(*) FROM schedule_bookings WHERE created_at >= ?) AS reservations30j,
         (SELECT COUNT(*) FROM search_events WHERE created_at >= ?) AS recherches30j`,
    )
    .get(since, since);
  return row ?? {
    agences: 0,
    agencesActives: 0,
    horaires: 0,
    villes: 0,
    reservations30j: 0,
    recherches30j: 0,
  };
}
