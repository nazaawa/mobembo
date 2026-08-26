import type { DbHandle } from "@/lib/db";
import { getDb, tx } from "@/lib/db";
import { newId } from "@/lib/core/ids";
import { dayBounds, nowIso } from "@/lib/core/time";
import { errors } from "@/lib/core/errors";
import { audit } from "./audit";
import { materialiseTripSeats } from "./seats";
import { seatCountFor } from "./seat-map";
import { assertOnlinePriceNotHigher } from "./settlements";
import { getBus, getSeatMap, type RouteRow, type SeatMapRow, type TripRow } from "./repo";
import type { BusCategory, Channel, DepartureMode, SeatMapLayout } from "./types";

/** §2.1 Plan de sièges éditable graphiquement, jamais codé en dur. */
export async function createSeatMap(params: {
  companyId: string | null;
  name: string;
  rows: number;
  layout: SeatMapLayout;
  disabledSeats: string[];
  actor?: { userId: string; role: string };
}): Promise<SeatMapRow> {
  if (params.rows < 1 || params.rows > 30) {
    throw errors.invalid("Le nombre de rangées doit être compris entre 1 et 30.");
  }
  if (params.layout.columns.filter((c) => c !== "aisle").length === 0) {
    throw errors.invalid("Le plan doit comporter au moins une colonne de sièges.");
  }
  return tx(async (db) => {
    const id = newId("smp");
    const count = seatCountFor(params.rows, params.layout, params.disabledSeats);
    await db
      .prepare(
        `INSERT INTO seat_maps
         (id, company_id, name, row_count, layout_json, disabled_seats, seat_count, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
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
      await audit(
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
    return (await db
      .prepare<SeatMapRow>(`SELECT *, row_count AS \`rows\` FROM seat_maps WHERE id = ?`)
      .get(id)) as SeatMapRow;
  });
}

/**
 * Modifier un gabarit déjà utilisé par un trajet en vente changerait le nombre
 * de sièges sous les pieds des billets émis. Une nouvelle version est créée à
 * la place.
 */
export async function updateSeatMap(params: {
  seatMapId: string;
  name: string;
  rows: number;
  layout: SeatMapLayout;
  disabledSeats: string[];
  actor: { userId: string; role: string };
}): Promise<SeatMapRow> {
  return tx(async (db) => {
    const existing = await getSeatMap(params.seatMapId, db);
    const inUse = await db
      .prepare<{ n: number }>(
        `SELECT COUNT(*) AS n FROM trips t JOIN buses b ON b.id = t.bus_id
          WHERE b.seat_map_id = ? AND t.status IN ('PLANIFIE','EN_VENTE')`,
      )
      .get(params.seatMapId);
    if ((inUse?.n ?? 0) > 0) {
      throw errors.conflict(
        "PLAN_EN_USAGE",
        `Ce plan sert à ${inUse?.n} trajet(s) en vente. Créez-en une nouvelle version.`,
      );
    }
    const count = seatCountFor(params.rows, params.layout, params.disabledSeats);
    await db
      .prepare(
        `UPDATE seat_maps SET name = ?, row_count = ?, layout_json = ?, disabled_seats = ?, seat_count = ?
        WHERE id = ?`,
      )
      .run(
        params.name,
        params.rows,
        JSON.stringify(params.layout),
        JSON.stringify(params.disabledSeats),
        count,
        params.seatMapId,
      );
    await audit(
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

export async function createBus(params: {
  companyId: string;
  plateNumber: string;
  seatMapId: string;
  category: BusCategory;
  actor?: { userId: string; role: string };
}): Promise<{ id: string }> {
  return tx(async (db) => {
    const seatMap = await getSeatMap(params.seatMapId, db);
    if (seatMap.company_id !== null && seatMap.company_id !== params.companyId) {
      throw errors.forbidden("Ce plan de sièges appartient à une autre compagnie.");
    }
    const id = newId("bus");
    await db
      .prepare(
        `INSERT INTO buses (id, company_id, plate_number, seat_map_id, category, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'ACTIF', ?)`,
      )
      .run(id, params.companyId, params.plateNumber.toUpperCase(), params.seatMapId, params.category, nowIso());
    if (params.actor) {
      await audit(
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

export async function createRoute(params: {
  companyId: string;
  originCity: string;
  destinationCity: string;
  distanceKm?: number | null;
  durationEstMin?: number | null;
}): Promise<RouteRow> {
  return tx(async (db) => {
    const id = newId("rte");
    await db
      .prepare(
        `INSERT INTO routes
         (id, company_id, origin_city, destination_city, distance_km, duration_est_min, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        params.companyId,
        params.originCity,
        params.destinationCity,
        params.distanceKm ?? null,
        params.durationEstMin ?? null,
        nowIso(),
      );
    return (await db.prepare<RouteRow>(`SELECT * FROM routes WHERE id = ?`).get(id)) as RouteRow;
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
export async function createTrip(input: CreateTripInput): Promise<TripRow> {
  return tx(async (db) => {
    const bus = await getBus(input.busId, db);
    if (bus.company_id !== input.companyId) {
      throw errors.forbidden("Ce bus appartient à une autre compagnie.");
    }
    const route = await db.prepare<{ company_id: string }>(`SELECT company_id FROM routes WHERE id = ?`).get(input.routeId);
    if (!route) throw errors.notFound("Ligne");
    if (route.company_id !== input.companyId) {
      throw errors.forbidden("Cette ligne appartient à une autre compagnie.");
    }
    if (input.originAgencyId) {
      const agency = await db
        .prepare<{ company_id: string }>(`SELECT company_id FROM agencies WHERE id = ?`)
        .get(input.originAgencyId);
      if (!agency) throw errors.notFound("Agence");
      if (agency.company_id !== input.companyId) {
        throw errors.forbidden("Cette agence appartient à une autre compagnie.");
      }
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

    // Un bus déjà engagé sur un autre départ à la même heure serait vendu deux
    // fois. MySQL n'a pas l'équivalent de strftime() : les horodatages sont
    // des chaînes ISO 8601, comparées ici en millisecondes côté JS plutôt que
    // par une fonction de date SQL.
    const candidates = await db
      .prepare<{ departure_datetime: string }>(
        `SELECT departure_datetime FROM trips
          WHERE bus_id = ? AND status NOT IN ('ANNULE','CLOTURE')`,
      )
      .all(input.busId);
    const targetTime = new Date(input.departureDatetime).getTime();
    const clash = candidates.some(
      (c) => Math.abs(new Date(c.departure_datetime).getTime() - targetTime) < 3_600_000,
    );
    if (clash) {
      throw errors.conflict("BUS_DEJA_ENGAGE", "Ce bus a déjà un départ programmé à cette heure.");
    }

    const id = newId("trp");
    await db
      .prepare(
        `INSERT INTO trips
         (id, company_id, route_id, bus_id, origin_agency_id, departure_datetime,
          departure_mode, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'EN_VENTE', ?)`,
      )
      .run(
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
      await insertPrice.run(newId("prc"), id, price.category, price.priceUsd, price.priceCdf);
    }
    await assertOnlinePriceNotHigher(id, db);

    const seatMap = await getSeatMap(bus.seat_map_id, db);
    await materialiseTripSeats(db, id, seatMap, input.quotas);

    if (input.actor) {
      await audit(
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

    return (await db.prepare<TripRow>(`SELECT * FROM trips WHERE id = ?`).get(id)) as TripRow;
  });
}

export async function cancelTrip(params: {
  tripId: string;
  reason: string;
  actor: { userId: string; role: string; companyId?: string | null };
}): Promise<{ billetsImpactes: number }> {
  if (!params.reason.trim()) throw errors.invalid("Le motif d'annulation est obligatoire.");
  return tx(async (db) => {
    const tickets = await db
      .prepare<{ id: string }>(
        `SELECT id FROM tickets WHERE trip_id = ? AND status IN ('EMIS','EN_REVENTE')`,
      )
      .all(params.tripId);
    await db.prepare(`UPDATE trips SET status = 'ANNULE' WHERE id = ?`).run(params.tripId);
    await audit(
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

export async function searchTrips(params: {
  origin: string;
  destination: string;
  day: string;
  db?: DbHandle;
}): Promise<SearchResult[]> {
  const db = params.db ?? getDb();
  const { start, end } = dayBounds(params.day);

  return db
    .prepare<SearchResult>(
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
          AND t.departure_datetime >= ? AND t.departure_datetime < ?
          AND t.status IN ('PLANIFIE','EN_VENTE')
          -- §2.2 : le mode « départ à remplissage » ne s'affiche jamais en ligne.
          AND t.departure_mode = 'HORAIRE_FIXE'
          AND c.status = 'ACTIVE'
        ORDER BY t.departure_datetime`,
    )
    .all(params.origin, params.destination, start, end);
}

export interface PublishedRouteSummary {
  origine: string;
  destination: string;
  departs: number;
  prixMinimumUsd: number | null;
}

/**
 * Axes réellement publiés par l'ensemble des compagnies actives. La page
 * passager ne privilégie aucune compagnie et ne code aucune destination en dur.
 */
export async function publishedRoutes(
  day: string,
  limit = 3,
  db: DbHandle = getDb(),
): Promise<PublishedRouteSummary[]> {
  const { start, end } = dayBounds(day);
  return db
    .prepare<PublishedRouteSummary>(
      `SELECT r.origin_city AS origine, r.destination_city AS destination,
              COUNT(DISTINCT t.id) AS departs,
              MIN(p.price_usd) AS prixMinimumUsd
         FROM routes r
         JOIN companies c ON c.id = r.company_id AND c.status = 'ACTIVE'
         LEFT JOIN trips t ON t.route_id = r.id
          AND t.departure_datetime >= ? AND t.departure_datetime < ?
          AND t.status IN ('PLANIFIE','EN_VENTE')
          AND t.departure_mode = 'HORAIRE_FIXE'
         LEFT JOIN buses b ON b.id = t.bus_id
         LEFT JOIN trip_prices p ON p.trip_id = t.id AND p.category = b.category
        GROUP BY r.origin_city, r.destination_city
        ORDER BY departs DESC, r.origin_city, r.destination_city
        LIMIT ?`,
    )
    .all(start, end, limit);
}

export async function knownCities(db: DbHandle = getDb()): Promise<string[]> {
  const rows = await db
    .prepare<{ city: string }>(
      `SELECT r.origin_city AS city FROM routes r
         JOIN companies c ON c.id = r.company_id WHERE c.status = 'ACTIVE'
       UNION
       SELECT r.destination_city FROM routes r
         JOIN companies c ON c.id = r.company_id WHERE c.status = 'ACTIVE'
       ORDER BY city`,
    )
    .all();
  return rows.map((r) => r.city);
}
