/**
 * Jeu de données de démonstration (§4.2 « Code et données »).
 *
 * Il reproduit la cible de la phase 1 : « une compagnie, une agence, un axe »
 * (§4.1), plus ce qu'il faut pour dérouler les phases 2 et 3 — un second axe,
 * des trajets à venir, des comptes pour chaque rôle.
 *
 *   npm run seed
 */
import { randomBytes } from "node:crypto";
import { getDb, resetDb, tx } from "@/lib/db";
import { newId } from "@/lib/core/ids";
import { nowIso, plusDays } from "@/lib/core/time";
import { toMinor } from "@/lib/core/money";
import { DEFAULT_POLICY } from "@/lib/domain/types";
import { LAYOUT_PRESETS } from "@/lib/domain/seat-map";
import { createSeatMap, createBus, createRoute, createTrip } from "@/lib/domain/planning";
import { hashPassword } from "@/lib/auth/password";

const MOT_DE_PASSE_DEMO = "mobembo2026";

function at(days: number, hour: number, minute = 0): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  // Les horaires sont exprimés en heure de Kinshasa (UTC+1).
  date.setUTCHours(hour - 1, minute, 0, 0);
  return date.toISOString();
}

function main(): void {
  const db = getDb();
  resetDb();

  const companyId = newId("cmp");
  const now = nowIso();

  tx((t) => {
    t.prepare(
      `INSERT INTO companies
         (id, name, logo, status, commission_rate, currency_rate_usd_cdf, currency_rate_at,
          qr_secret, policy_json, created_at)
       VALUES (?, 'Transco Kin', NULL, 'ACTIVE', 0.06, 2850, ?, ?, ?, ?)`,
    ).run(companyId, now, randomBytes(32).toString("hex"), JSON.stringify(DEFAULT_POLICY), now);

    // §2.10 : « Gratuit pendant les 3 mois de pilote, puis facturé. »
    t.prepare(
      `INSERT INTO subscriptions
         (id, company_id, plan, buses_count, monthly_amount, currency,
          period_start, period_end, status, created_at)
       VALUES (?, ?, 'STARTER', 3, 0, 'USD', ?, ?, 'PILOTE_GRATUIT', ?)`,
    ).run(newId("sub"), companyId, now, plusDays(90), now);
  });

  const agencies = [
    { id: newId("agc"), name: "Gare de Limete", city: "Kinshasa", address: "Boulevard Lumumba, Limete" },
    { id: newId("agc"), name: "Agence Matadi", city: "Matadi", address: "Avenue du Port, Matadi" },
  ];
  tx((t) => {
    for (const agency of agencies) {
      t.prepare(
        `INSERT INTO agencies
           (id, company_id, name, city, address, gps, opening_hours, status, ticket_sequence, created_at)
         VALUES (?, ?, ?, ?, ?, NULL, '05:00-19:00', 'ACTIVE', 0, ?)`,
      ).run(agency.id, companyId, agency.name, agency.city, agency.address, now);
    }
  });

  const staff = [
    { phone: "+243810000001", name: "Équipe plateforme", role: "SUPER_ADMIN", agency: null },
    { phone: "+243810000002", name: "Direction Transco", role: "ADMIN_COMPAGNIE", agency: null },
    { phone: "+243810000003", name: "Chef de gare Limete", role: "GERANT_AGENCE", agency: agencies[0].id },
    { phone: "+243810000004", name: "Guichetier Limete", role: "GUICHETIER", agency: agencies[0].id },
    { phone: "+243810000005", name: "Contrôleur Transco", role: "CONTROLEUR", agency: agencies[0].id },
  ] as const;

  tx((t) => {
    for (const person of staff) {
      const userId = newId("usr");
      t.prepare(
        `INSERT INTO users (id, phone, name, password_hash, status, locale, created_at)
         VALUES (?, ?, ?, ?, 'ACTIVE', 'fr', ?)`,
      ).run(userId, person.phone, person.name, hashPassword(MOT_DE_PASSE_DEMO), now);
      t.prepare(
        `INSERT INTO user_roles (id, user_id, role, company_id, agency_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(
        newId("url"),
        userId,
        person.role,
        person.role === "SUPER_ADMIN" ? null : companyId,
        person.agency,
        now,
      );
      // §1.5 : « Un utilisateur cumule plusieurs rôles — un gérant est souvent
      // aussi guichetier — mais jamais dans la même session. »
      if (person.role === "GERANT_AGENCE") {
        t.prepare(
          `INSERT INTO user_roles (id, user_id, role, company_id, agency_id, created_at)
           VALUES (?, ?, 'GUICHETIER', ?, ?, ?)`,
        ).run(newId("url"), userId, companyId, person.agency, now);
      }
    }
  });

  const plan22 = createSeatMap({
    companyId,
    name: "Autocar 2+2 — 60 places",
    rows: 15,
    layout: LAYOUT_PRESETS["2+2"],
    disabledSeats: [],
  });
  const plan23 = createSeatMap({
    companyId,
    name: "Bus 2+3 — 70 places (porte au rang 8)",
    rows: 14,
    layout: LAYOUT_PRESETS["2+3"],
    // §2.1 : sièges désactivés (porte, moteur).
    disabledSeats: ["8C", "8D"],
  });

  const buses = [
    createBus({ companyId, plateNumber: "KN 4512 AB", seatMapId: plan22.id, category: "VIP" }),
    createBus({ companyId, plateNumber: "KN 7788 CD", seatMapId: plan22.id, category: "STANDARD" }),
    createBus({ companyId, plateNumber: "KN 9021 EF", seatMapId: plan23.id, category: "STANDARD" }),
  ];

  const kinMatadi = createRoute({
    companyId,
    originCity: "Kinshasa",
    destinationCity: "Matadi",
    distanceKm: 352,
    durationEstMin: 330,
  });
  const matadiKin = createRoute({
    companyId,
    originCity: "Matadi",
    destinationCity: "Kinshasa",
    distanceKm: 352,
    durationEstMin: 330,
  });
  const kinKikwit = createRoute({
    companyId,
    originCity: "Kinshasa",
    destinationCity: "Kikwit",
    distanceKm: 525,
    durationEstMin: 540,
  });

  // §2.3 exemple du cahier des charges : 35 guichet / 20 en ligne / 5 réservés.
  const quotas60 = { GUICHET: 35, EN_LIGNE: 20, RESERVE_COMPAGNIE: 5 } as const;
  const quotas68 = { GUICHET: 40, EN_LIGNE: 24, RESERVE_COMPAGNIE: 4 } as const;

  const trips: Array<{ label: string; id: string }> = [];

  /** Un départ déjà passé au moment du seed n'a aucun intérêt de démonstration. */
  const plan = (
    label: string,
    input: Parameters<typeof createTrip>[0],
  ): void => {
    if (new Date(input.departureDatetime).getTime() <= Date.now()) return;
    trips.push({ label, id: createTrip(input).id });
  };

  for (let day = 0; day <= 7; day++) {
    plan(`Kinshasa→Matadi VIP J+${day}`, {
        companyId,
        routeId: kinMatadi.id,
        busId: buses[0].id,
        originAgencyId: agencies[0].id,
        departureDatetime: at(day, 6, 30),
        departureMode: "HORAIRE_FIXE",
        prices: [{ category: "VIP", priceUsd: toMinor(25), priceCdf: toMinor(71250) }],
        quotas: quotas60,
    });
    plan(`Kinshasa→Matadi standard J+${day}`, {
        companyId,
        routeId: kinMatadi.id,
        busId: buses[1].id,
        originAgencyId: agencies[0].id,
        departureDatetime: at(day, 13, 0),
        departureMode: "HORAIRE_FIXE",
        prices: [{ category: "STANDARD", priceUsd: toMinor(15), priceCdf: toMinor(42750) }],
        quotas: quotas60,
    });
    plan(`Matadi→Kinshasa VIP J+${day}`, {
        companyId,
        routeId: matadiKin.id,
        busId: buses[0].id,
        originAgencyId: agencies[1].id,
        departureDatetime: at(day, 15, 0),
        departureMode: "HORAIRE_FIXE",
        prices: [{ category: "VIP", priceUsd: toMinor(25), priceCdf: toMinor(71250) }],
        quotas: quotas60,
    });
    // §2.2 : un départ à remplissage, invisible en ligne, quota 100 % guichet.
    plan(`Kinshasa→Kikwit à remplissage J+${day}`, {
        companyId,
        routeId: kinKikwit.id,
        busId: buses[2].id,
        originAgencyId: agencies[0].id,
        departureDatetime: at(day, 8, 0),
        departureMode: "DEPART_A_REMPLISSAGE",
        prices: [{ category: "STANDARD", priceUsd: toMinor(22), priceCdf: toMinor(62700) }],
        quotas: { GUICHET: 64, EN_LIGNE: 0, RESERVE_COMPAGNIE: 4 },
    });
  }
  void quotas68;

  const counts = db
    .prepare(
      `SELECT (SELECT COUNT(*) FROM trips) AS trajets,
              (SELECT COUNT(*) FROM trip_seats) AS sieges,
              (SELECT COUNT(*) FROM users) AS utilisateurs`,
    )
    .get() as { trajets: number; sieges: number; utilisateurs: number };

  console.log("Jeu de démonstration créé.");
  console.log(`  Compagnie   : Transco Kin (${companyId})`);
  console.log(`  Agences     : ${agencies.map((a) => a.name).join(", ")}`);
  console.log(`  Trajets     : ${counts.trajets} (${trips.length} planifiés)`);
  console.log(`  Sièges      : ${counts.sieges}`);
  console.log(`  Utilisateurs: ${counts.utilisateurs}`);
  console.log("");
  console.log("Comptes staff — mot de passe commun : " + MOT_DE_PASSE_DEMO);
  for (const person of staff) {
    console.log(`  ${person.phone}  ${person.role.padEnd(16)} ${person.name}`);
  }
  console.log("");
  console.log("Passager : aucun compte à créer, connexion par OTP SMS.");
  console.log("En développement, le code OTP est affiché à l'écran.");
}

main();
