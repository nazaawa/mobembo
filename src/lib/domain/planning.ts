import type { Database } from "better-sqlite3";
import { getDb, tx } from "@/lib/db";
import { newId } from "@/lib/core/ids";
import { nowIso } from "@/lib/core/time";
import { errors } from "@/lib/core/errors";
import { audit } from "./audit";
import { materialiseTripSeats } from "./seats";
import { seatCountFor } from "./seat-map";
import { assertOnlinePriceNotHigher } from "./settlements";
import { getBus, getSeatMap, type RouteRow, type SeatMapRow, type TripRow } from "./repo";
import type { BusCategory, Channel, DepartureMode, SeatMapLayout } from "./types";

/** §2.1 Plan de sièges éditable graphiquement, jamais codé en dur. */
export function createSeatMap(params: {
  companyId: string | null;
  name: string;
  rows: number;
  layout: SeatMapLayout;
  disabledSeats: string[];
  actor?: { userId: string; role: string };
}): SeatMapRow {
  if (params.rows < 1 || params.rows > 30) {
    throw errors.invalid("Le nombre de rangées doit être compris entre 1 et 30.");
  }
  if (params.layout.columns.filter((c) => c !== "aisle").length === 0) {
    throw errors.invalid("Le plan doit comporter au moins une colonne de sièges.");
  }
  return tx((db) => {
    const id = newId("smp");
    const count = seatCountFor(params.rows, params.layout, params.disabledSeats);
    db.prepare(
      `INSERT INTO seat_maps
         (id, company_id, name, rows, layout_json, disabled_seats, seat_count, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      params.companyId,
      params.name,
      params.rows,
      JSON.stringify(params.layout),
      JSON.stringify(params.disabledSeats),
      count,
      nowIso(),
    );
    if (params.actor) {
      audit(
        {
          userId: params.actor.userId,
          role: params.actor.role,
          companyId: params.companyId,
          action: "CREATION_PLAN_SIEGES",
          entity: "seat_map",
          entityId: id,
          after: { name: params.name, rows: params.rows, seats: count },
        },
        db,
      );
    }
    return db.prepare(`SELECT * FROM seat_maps WHERE id = ?`).get(id) as SeatMapRow;
  });
}

/**
 * Modifier un gabarit déjà utilisé par un trajet en vente changerait le nombre
 * de sièges sous les pieds des billets émis. Une nouvelle version est créée à
 * la place.
 */
export function updateSeatMap(params: {
  seatMapId: string;
  name: string;
  rows: number;
  layout: SeatMapLayout;
  disabledSeats: string[];
  actor: { userId: string; role: string };
}): SeatMapRow {
  return tx((db) => {
    const existing = getSeatMap(params.seatMapId, db);
    const inUse = db
      .prepare(
        `SELECT COUNT(*) AS n FROM trips t JOIN buses b ON b.id = t.bus_id
          WHERE b.seat_map_id = ? AND t.status IN ('PLANIFIE','EN_VENTE')`,
      )
      .get(params.seatMapId) as { n: number };
    if (inUse.n > 0) {
      throw errors.conflict(
        "PLAN_EN_USAGE",
        `Ce plan sert à ${inUse.n} trajet(s) en vente. Créez-en une nouvelle version.`,
      );
    }
    const count = seatCountFor(params.rows, params.layout, params.disabledSeats);
    db.prepare(
      `UPDATE seat_maps SET name = ?, rows = ?, layout_json = ?, disabled_seats = ?, seat_count = ?
        WHERE id = ?`,
    ).run(
      params.name,
      params.rows,
      JSON.stringify(params.layout),
      JSON.stringify(params.disabledSeats),
      count,
      params.seatMapId,
    );
    audit(
      {
        userId: params.actor.userId,
        role: params.actor.role,
        companyId: existing.company_id,
        action: "MODIFICATION_PLAN_SIEGES",
        entity: "seat_map",
        entityId: params.seatMapId,
        before: { rows: existing.rows, seats: existing.seat_count },
        after: { rows: params.rows, seats: count },
      },
      db,
    );
    return getSeatMap(params.seatMapId, db);
  });
}

export function createBus(params: {
  companyId: string;
  plateNumber: string;
  seatMapId: string;
  category: BusCategory;
  actor?: { userId: string; role: string };
}): { id: string } {
  return tx((db) => {
    getSeatMap(params.seatMapId, db);
    const id = newId("bus");
    db.prepare(
      `INSERT INTO buses (id, company_id, plate_number, seat_map_id, category, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'ACTIF', ?)`,
    ).run(id, params.companyId, params.plateNumber.toUpperCase(), params.seatMapId, params.category, nowIso());
    if (params.actor) {
      audit(
        {
          userId: params.actor.userId,
          role: params.actor.role,
          companyId: params.companyId,
          action: "CREATION_BUS",
          entity: "bus",
          entityId: id,
          after: { plaque: params.plateNumber, categorie: params.category },
        },
        db,
      );
    }
    return { id };
  });
}

export function createRoute(params: {
  companyId: string;
  originCity: string;
  destinationCity: string;
  distanceKm?: number | null;
  durationEstMin?: number | null;
}): RouteRow {
  return tx((db) => {
    const id = newId("rte");
    db.prepare(
      `INSERT INTO routes
         (id, company_id, origin_city, destination_city, distance_km, duration_est_min, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      params.companyId,
      params.originCity,
      params.destinationCity,
      params.distanceKm ?? null,
      params.durationEstMin ?? null,
      nowIso(),
    );
    return db.prepare(`SELECT * FROM routes WHERE id = ?`).get(id) as RouteRow;
  });
}

export interface CreateTripInput {
  companyId: string;
  routeId: string;
  busId: string;
  originAgencyId: string | null;
  departureDatetime: string;
  departureMode: DepartureMode;
  prices: Array<{ category: BusCategory; priceUsd: number; priceCdf: number }>;
  quotas: Record<Channel, number>;
  actor?: { userId: string; role: string };
}

/**
 * §2.2 : « Un trajet = un bus + une ligne + une date et heure de départ + une
 * grille tarifaire. » Les sièges et l'allocation par canal sont matérialisés
 * dans la même transaction : un trajet ne peut pas exister sans son plan.
 */
export function createTrip(input: CreateTripInput): TripRow {
  return tx((db) => {
    const bus = getBus(input.busId, db);
    if (bus.company_id !== input.companyId) {
      throw errors.forbidden("Ce bus appartient à une autre compagnie.");
    }
    if (new Date(input.departureDatetime).getTime() < Date.now() - 3_600_000) {
      throw errors.invalid("La date de départ est dans le passé.");
    }
    if (input.departureMode === "DEPART_A_REMPLISSAGE" && input.quotas.EN_LIGNE > 0) {
      // §2.2 : « Vente guichet uniquement, aucune heure affichée en ligne. »
      throw errors.invalid(
        "Un départ à remplissage ne peut pas recevoir de quota en ligne : l'horaire n'est pas tenu.",
      );
    }

    // Un bus déjà engagé sur un autre départ à la même heure serait vendu deux fois.
    const clash = db
      .prepare(
        `SELECT COUNT(*) AS n FROM trips
          WHERE bus_id = ? AND status NOT IN ('ANNULE','CLOTURE')
            AND ABS(strftime('%s', departure_datetime) - strftime('%s', ?)) < 3600`,
      )
      .get(input.busId, input.departureDatetime) as { n: number };
    if (clash.n > 0) {
      throw errors.conflict("BUS_DEJA_ENGAGE", "Ce bus a déjà un départ programmé à cette heure.");
    }

    const id = newId("trp");
    db.prepare(
      `INSERT INTO trips
         (id, company_id, route_id, bus_id, origin_agency_id, departure_datetime,
          departure_mode, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'EN_VENTE', ?)`,
    ).run(
      id,
      input.companyId,
      input.routeId,
      input.busId,
      input.originAgencyId,
      input.departureDatetime,
      input.departureMode,
      nowIso(),
    );

    const insertPrice = db.prepare(
      `INSERT INTO trip_prices (id, trip_id, category, price_usd, price_cdf) VALUES (?, ?, ?, ?, ?)`,
    );
    for (const price of input.prices) {
      if (price.priceUsd <= 0 || price.priceCdf <= 0) {
        throw errors.invalid(`Tarif ${price.category} : les deux devises sont obligatoires (§3.2).`);
      }
      insertPrice.run(newId("prc"), id, price.category, price.priceUsd, price.priceCdf);
    }
    assertOnlinePriceNotHigher(id, db);

    const seatMap = getSeatMap(bus.seat_map_id, db);
    materialiseTripSeats(db, id, seatMap, input.quotas);

    if (input.actor) {
      audit(
        {
          userId: input.actor.userId,
          role: input.actor.role,
          companyId: input.companyId,
          action: "CREATION_TRAJET",
          entity: "trip",
          entityId: id,
          after: {
            depart: input.departureDatetime,
            mode: input.departureMode,
            quotas: input.quotas,
          },
        },
        db,
      );
    }

    return db.prepare(`SELECT * FROM trips WHERE id = ?`).get(id) as TripRow;
  });
}

export function cancelTrip(params: {
  tripId: string;
  reason: string;
  actor: { userId: string; role: string; companyId?: string | null };
}): { billetsImpactes: number } {
  if (!params.reason.trim()) throw errors.invalid("Le motif d'annulation est obligatoire.");
  return tx((db) => {
    const tickets = db
      .prepare(`SELECT id FROM tickets WHERE trip_id = ? AND status IN ('EMIS','EN_REVENTE')`)
      .all(params.tripId) as { id: string }[];
    db.prepare(`UPDATE trips SET status = 'ANNULE' WHERE id = ?`).run(params.tripId);
    audit(
      {
        userId: params.actor.userId,
        role: params.actor.role,
        companyId: params.actor.companyId,
        action: "ANNULATION_TRAJET",
        entity: "trip",
        entityId: params.tripId,
        after: { motif: params.reason, billetsImpactes: tickets.length },
      },
      db,
    );
    // Les remboursements passent par la grille de responsabilité (§2.10) :
    // trajet annulé = 100 % + avoir 25 %, imputé à la compagnie.
    return { billetsImpactes: tickets.length };
  });
}

/** §2.5.1-2 Recherche passager : ville de départ, ville d'arrivée, date. */
export interface SearchResult {
  tripId: string;
  compagnie: string;
  companyId: string;
  origine: string;
  destination: string;
  depart: string;
  dureeEstimeeMin: number | null;
  categorie: BusCategory;
  prixUsd: number;
  prixCdf: number;
  placesEnLigne: number;
  placesRemisesEnVente: number;
}

export function searchTrips(params: {
  origin: string;
  destination: string;
  day: string;
  db?: Database;
}): SearchResult[] {
  const db = params.db ?? getDb();
  const start = `${params.day}T00:00:00.000Z`;
  const end = `${params.day}T23:59:59.999Z`;

  return db
    .prepare(
      `SELECT t.id AS tripId, c.name AS compagnie, c.id AS companyId,
              r.origin_city AS origine, r.destination_city AS destination,
              t.departure_datetime AS depart, r.duration_est_min AS dureeEstimeeMin,
              b.category AS categorie, p.price_usd AS prixUsd, p.price_cdf AS prixCdf,
              (SELECT COUNT(*) FROM trip_seats s
                WHERE s.trip_id = t.id AND s.channel = 'EN_LIGNE' AND s.status = 'DISPONIBLE') AS placesEnLigne,
              (SELECT COUNT(*) FROM resale_listings l
                WHERE l.trip_id = t.id AND l.status = 'ACTIVE') AS placesRemisesEnVente
         FROM trips t
         JOIN routes r ON r.id = t.route_id
         JOIN buses b ON b.id = t.bus_id
         JOIN companies c ON c.id = t.company_id
         JOIN trip_prices p ON p.trip_id = t.id AND p.category = b.category
        WHERE LOWER(r.origin_city) = LOWER(?)
          AND LOWER(r.destination_city) = LOWER(?)
          AND t.departure_datetime BETWEEN ? AND ?
          AND t.status IN ('PLANIFIE','EN_VENTE')
          -- §2.2 : le mode « départ à remplissage » ne s'affiche jamais en ligne.
          AND t.departure_mode = 'HORAIRE_FIXE'
          AND c.status = 'ACTIVE'
        ORDER BY t.departure_datetime`,
    )
    .all(params.origin, params.destination, start, end) as SearchResult[];
}

export function knownCities(db: Database = getDb()): string[] {
  const rows = db
    .prepare(
      `SELECT origin_city AS city FROM routes
       UNION SELECT destination_city FROM routes ORDER BY city`,
    )
    .all() as { city: string }[];
  return rows.map((r) => r.city);
}
