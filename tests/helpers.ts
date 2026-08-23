import { randomBytes } from "node:crypto";
import { assertBaseDeTest, getDb, resetDb, tx } from "@/lib/db";
import { newId } from "@/lib/core/ids";
import { nowIso } from "@/lib/core/time";
import { toMinor } from "@/lib/core/money";
import { DEFAULT_POLICY } from "@/lib/domain/types";
import { LAYOUT_PRESETS } from "@/lib/domain/seat-map";
import { createSeatMap, createBus, createRoute, createTrip } from "@/lib/domain/planning";
import { hashPassword } from "@/lib/auth/password";
import type { Channel, CompanyPolicy } from "@/lib/domain/types";

export interface Fixture {
  companyId: string;
  agencyId: string;
  agency2Id: string;
  guichetierId: string;
  guichetier2Id: string;
  gerantId: string;
  controleurId: string;
  tripId: string;
  routeId: string;
  busId: string;
  priceUsd: number;
}

/** Repart d'une base vide pour chaque test : aucun état partagé. */
export function seedFixture(options?: {
  departureInHours?: number;
  quotas?: Record<Channel, number>;
  policy?: Partial<CompanyPolicy>;
}): Fixture {
  // Refuse de tourner sur autre chose qu'une base en mémoire : `resetDb()`
  // vide toutes les tables, et se tromper de cible coûterait la base réelle.
  assertBaseDeTest();
  resetDb();
  const db = getDb();
  const now = nowIso();
  const companyId = newId("cmp");

  tx((t) => {
    t.prepare(
      `INSERT INTO companies
         (id, name, status, commission_rate, currency_rate_usd_cdf, currency_rate_at,
          qr_secret, policy_json, created_at)
       VALUES (?, 'Compagnie Test', 'ACTIVE', 0.06, 2850, ?, ?, ?, ?)`,
    ).run(
      companyId,
      now,
      randomBytes(32).toString("hex"),
      JSON.stringify({ ...DEFAULT_POLICY, ...options?.policy }),
      now,
    );
  });

  const agencyId = newId("agc");
  const agency2Id = newId("agc");
  tx((t) => {
    const insert = t.prepare(
      `INSERT INTO agencies
         (id, company_id, name, city, address, status, ticket_sequence, created_at)
       VALUES (?, ?, ?, ?, '—', 'ACTIVE', 0, ?)`,
    );
    insert.run(agencyId, companyId, "Gare Test", "Kinshasa", now);
    insert.run(agency2Id, companyId, "Agence Aval", "Matadi", now);
  });

  const makeUser = (name: string, role: string, agency: string | null): string => {
    const id = newId("usr");
    tx((t) => {
      t.prepare(
        `INSERT INTO users (id, phone, name, password_hash, status, locale, created_at)
         VALUES (?, ?, ?, ?, 'ACTIVE', 'fr', ?)`,
      ).run(id, `+2438${id.slice(-8)}`, name, hashPassword("motdepasse"), now);
      t.prepare(
        `INSERT INTO user_roles (id, user_id, role, company_id, agency_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(newId("url"), id, role, companyId, agency, now);
    });
    return id;
  };

  const guichetierId = makeUser("Guichetier A", "GUICHETIER", agencyId);
  const guichetier2Id = makeUser("Guichetier B", "GUICHETIER", agencyId);
  const gerantId = makeUser("Gérant", "GERANT_AGENCE", agencyId);
  const controleurId = makeUser("Contrôleur", "CONTROLEUR", agencyId);

  const seatMap = createSeatMap({
    companyId,
    name: "Test 2+2",
    rows: 15,
    layout: LAYOUT_PRESETS["2+2"],
    disabledSeats: [],
  });
  const bus = createBus({
    companyId,
    plateNumber: "TEST 0001",
    seatMapId: seatMap.id,
    category: "STANDARD",
  });
  const route = createRoute({
    companyId,
    originCity: "Kinshasa",
    destinationCity: "Matadi",
    distanceKm: 352,
    durationEstMin: 330,
  });

  const departure = new Date(
    Date.now() + (options?.departureInHours ?? 48) * 3_600_000,
  ).toISOString();
  const priceUsd = toMinor(15);

  const trip = createTrip({
    companyId,
    routeId: route.id,
    busId: bus.id,
    originAgencyId: agencyId,
    departureDatetime: departure,
    departureMode: "HORAIRE_FIXE",
    prices: [{ category: "STANDARD", priceUsd, priceCdf: toMinor(42750) }],
    quotas: options?.quotas ?? { GUICHET: 35, EN_LIGNE: 20, RESERVE_COMPAGNIE: 5 },
  });

  void db;
  return {
    companyId,
    agencyId,
    agency2Id,
    guichetierId,
    guichetier2Id,
    gerantId,
    controleurId,
    tripId: trip.id,
    routeId: route.id,
    busId: bus.id,
    priceUsd,
  };
}

export function seatsOfChannel(tripId: string, channel: Channel, limit = 5): string[] {
  return (
    getDb()
      .prepare(
        `SELECT seat_number FROM trip_seats
          WHERE trip_id = ? AND channel = ? AND status = 'DISPONIBLE'
          ORDER BY seat_number LIMIT ?`,
      )
      .all(tripId, channel, limit) as { seat_number: string }[]
  ).map((r) => r.seat_number);
}

export function actorGuichetier(fixture: Fixture, userId?: string) {
  return {
    userId: userId ?? fixture.guichetierId,
    role: "GUICHETIER",
    companyId: fixture.companyId,
    agencyId: fixture.agencyId,
  };
}
