/**
 * Jeu de données de démonstration (§4.2 « Code et données »).
 *
 * Il reproduit la cible de la phase 1 : « une compagnie, une agence, un axe »
 * (§4.1), plus ce qu'il faut pour dérouler les phases 2 et 3 — un second axe,
 * des trajets à venir, des comptes pour chaque rôle — et une seconde
 * compagnie pour tester l'isolation multi-tenant du back-office plateforme.
 *
 *   npm run seed
 */
import { randomBytes } from "node:crypto";
import { getDb, resetDb, tx } from "@/lib/db";
import { newId } from "@/lib/core/ids";
import { nowIso, plusDays } from "@/lib/core/time";
import { toMinor } from "@/lib/core/money";
import { DEFAULT_POLICY } from "@/lib/domain/types";
import type { BusCategory, DepartureMode, SeatMapLayout } from "@/lib/domain/types";
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

type StaffPlan = {
  phone: string;
  name: string;
  role: "ADMIN_COMPAGNIE" | "GERANT_AGENCE" | "GUICHETIER" | "CONTROLEUR";
  agencyIndex: number | null;
};

type TripTemplate = {
  label: string;
  routeIndex: number;
  busIndex: number;
  agencyIndex: number;
  hour: number;
  minute?: number;
  mode: DepartureMode;
  prices: Array<{ category: BusCategory; priceUsd: number; priceCdf: number }>;
  quotas: { GUICHET: number; EN_LIGNE: number; RESERVE_COMPAGNIE: number };
};

type CompanyPlan = {
  name: string;
  commissionRate: number;
  currencyRateUsdCdf: number;
  agencies: Array<{ name: string; city: string; address: string }>;
  staff: StaffPlan[];
  seatMaps: Array<{ name: string; rows: number; layout: SeatMapLayout; disabledSeats: string[] }>;
  buses: Array<{ plateNumber: string; seatMapIndex: number; category: BusCategory }>;
  routes: Array<{ originCity: string; destinationCity: string; distanceKm: number; durationEstMin: number }>;
  tripTemplates: TripTemplate[];
  daysAhead: number;
};

type CompanySummary = {
  name: string;
  companyId: string;
  agencyNames: string[];
  staff: StaffPlan[];
  tripCount: number;
};

async function seedCompany(plan: CompanyPlan, now: string): Promise<CompanySummary> {
  const companyId = newId("cmp");

  await tx(async (t) => {
    await t
      .prepare(
        `INSERT INTO companies
         (id, name, logo, status, commission_rate, currency_rate_usd_cdf, currency_rate_at,
          qr_secret, policy_json, created_at)
       VALUES (?, ?, NULL, 'ACTIVE', ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        companyId,
        plan.name,
        plan.commissionRate,
        plan.currencyRateUsdCdf,
        now,
        randomBytes(32).toString("hex"),
        JSON.stringify(DEFAULT_POLICY),
        now,
      );

    // §2.10 : « Gratuit pendant les 3 mois de pilote, puis facturé. »
    await t
      .prepare(
        `INSERT INTO subscriptions
         (id, company_id, plan, buses_count, monthly_amount, currency,
          period_start, period_end, status, created_at)
       VALUES (?, ?, 'STARTER', ?, 0, 'USD', ?, ?, 'PILOTE_GRATUIT', ?)`,
      )
      .run(newId("sub"), companyId, plan.buses.length, now, plusDays(90), now);
  });

  const agencyIds: string[] = [];
  await tx(async (t) => {
    for (const agency of plan.agencies) {
      const id = newId("agc");
      agencyIds.push(id);
      await t
        .prepare(
          `INSERT INTO agencies
           (id, company_id, name, city, address, gps, opening_hours, status, ticket_sequence, created_at)
         VALUES (?, ?, ?, ?, ?, NULL, '05:00-19:00', 'ACTIVE', 0, ?)`,
        )
        .run(id, companyId, agency.name, agency.city, agency.address, now);
    }
  });

  await tx(async (t) => {
    for (const person of plan.staff) {
      const userId = newId("usr");
      const agencyId = person.agencyIndex === null ? null : agencyIds[person.agencyIndex];
      await t
        .prepare(
          `INSERT INTO users (id, phone, name, password_hash, status, locale, created_at)
         VALUES (?, ?, ?, ?, 'ACTIVE', 'fr', ?)`,
        )
        .run(userId, person.phone, person.name, hashPassword(MOT_DE_PASSE_DEMO), now);
      await t
        .prepare(
          `INSERT INTO user_roles (id, user_id, role, company_id, agency_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(newId("url"), userId, person.role, companyId, agencyId, now);
      // §1.5 : « Un utilisateur cumule plusieurs rôles — un gérant est souvent
      // aussi guichetier — mais jamais dans la même session. »
      if (person.role === "GERANT_AGENCE") {
        await t
          .prepare(
            `INSERT INTO user_roles (id, user_id, role, company_id, agency_id, created_at)
           VALUES (?, ?, 'GUICHETIER', ?, ?, ?)`,
          )
          .run(newId("url"), userId, companyId, agencyId, now);
      }
    }
  });

  const seatMapIds: string[] = [];
  for (const seatMap of plan.seatMaps) {
    const created = await createSeatMap({
      companyId,
      name: seatMap.name,
      rows: seatMap.rows,
      layout: seatMap.layout,
      disabledSeats: seatMap.disabledSeats,
    });
    seatMapIds.push(created.id);
  }

  const busIds: string[] = [];
  for (const bus of plan.buses) {
    const created = await createBus({
      companyId,
      plateNumber: bus.plateNumber,
      seatMapId: seatMapIds[bus.seatMapIndex],
      category: bus.category,
    });
    busIds.push(created.id);
  }

  const routeIds: string[] = [];
  for (const route of plan.routes) {
    const created = await createRoute({
      companyId,
      originCity: route.originCity,
      destinationCity: route.destinationCity,
      distanceKm: route.distanceKm,
      durationEstMin: route.durationEstMin,
    });
    routeIds.push(created.id);
  }

  /** Un départ déjà passé au moment du seed n'a aucun intérêt de démonstration. */
  let tripCount = 0;
  for (let day = 0; day <= plan.daysAhead; day++) {
    for (const template of plan.tripTemplates) {
      const departureDatetime = at(day, template.hour, template.minute ?? 0);
      if (new Date(departureDatetime).getTime() <= Date.now()) continue;
      await createTrip({
        companyId,
        routeId: routeIds[template.routeIndex],
        busId: busIds[template.busIndex],
        originAgencyId: agencyIds[template.agencyIndex],
        departureDatetime,
        departureMode: template.mode,
        prices: template.prices,
        quotas: template.quotas,
      });
      tripCount++;
    }
  }

  return {
    name: plan.name,
    companyId,
    agencyNames: plan.agencies.map((a) => a.name),
    staff: plan.staff,
    tripCount,
  };
}

async function main(): Promise<void> {
  const db = getDb();
  await resetDb();
  const now = nowIso();

  // Compte plateforme, commun à toutes les compagnies (§1.5 : rôle SUPER_ADMIN
  // sans company_id).
  const superAdmin = { phone: "+243810000001", name: "Équipe plateforme" };
  await tx(async (t) => {
    const userId = newId("usr");
    await t
      .prepare(
        `INSERT INTO users (id, phone, name, password_hash, status, locale, created_at)
       VALUES (?, ?, ?, ?, 'ACTIVE', 'fr', ?)`,
      )
      .run(userId, superAdmin.phone, superAdmin.name, hashPassword(MOT_DE_PASSE_DEMO), now);
    await t
      .prepare(
        `INSERT INTO user_roles (id, user_id, role, company_id, agency_id, created_at)
       VALUES (?, ?, 'SUPER_ADMIN', NULL, NULL, ?)`,
      )
      .run(newId("url"), userId, now);
  });

  const plans: CompanyPlan[] = [
    {
      name: "Transco Kin",
      commissionRate: 0.06,
      currencyRateUsdCdf: 2850,
      agencies: [
        { name: "Gare de Limete", city: "Kinshasa", address: "Boulevard Lumumba, Limete" },
        { name: "Agence Matadi", city: "Matadi", address: "Avenue du Port, Matadi" },
      ],
      staff: [
        { phone: "+243810000002", name: "Direction Transco", role: "ADMIN_COMPAGNIE", agencyIndex: null },
        { phone: "+243810000003", name: "Chef de gare Limete", role: "GERANT_AGENCE", agencyIndex: 0 },
        { phone: "+243810000004", name: "Guichetier Limete", role: "GUICHETIER", agencyIndex: 0 },
        { phone: "+243810000005", name: "Contrôleur Transco", role: "CONTROLEUR", agencyIndex: 0 },
      ],
      seatMaps: [
        { name: "Autocar 2+2 — 60 places", rows: 15, layout: LAYOUT_PRESETS["2+2"], disabledSeats: [] },
        {
          name: "Bus 2+3 — 70 places (porte au rang 8)",
          rows: 14,
          layout: LAYOUT_PRESETS["2+3"],
          disabledSeats: ["8C", "8D"],
        },
      ],
      buses: [
        { plateNumber: "KN 4512 AB", seatMapIndex: 0, category: "VIP" },
        { plateNumber: "KN 7788 CD", seatMapIndex: 0, category: "STANDARD" },
        { plateNumber: "KN 9021 EF", seatMapIndex: 1, category: "STANDARD" },
      ],
      routes: [
        { originCity: "Kinshasa", destinationCity: "Matadi", distanceKm: 352, durationEstMin: 330 },
        { originCity: "Matadi", destinationCity: "Kinshasa", distanceKm: 352, durationEstMin: 330 },
        { originCity: "Kinshasa", destinationCity: "Kikwit", distanceKm: 525, durationEstMin: 540 },
      ],
      tripTemplates: [
        {
          label: "Kinshasa→Matadi VIP",
          routeIndex: 0,
          busIndex: 0,
          agencyIndex: 0,
          hour: 6,
          minute: 30,
          mode: "HORAIRE_FIXE",
          prices: [{ category: "VIP", priceUsd: toMinor(25), priceCdf: toMinor(71250) }],
          quotas: { GUICHET: 35, EN_LIGNE: 20, RESERVE_COMPAGNIE: 5 },
        },
        {
          label: "Kinshasa→Matadi standard",
          routeIndex: 0,
          busIndex: 1,
          agencyIndex: 0,
          hour: 13,
          mode: "HORAIRE_FIXE",
          prices: [{ category: "STANDARD", priceUsd: toMinor(15), priceCdf: toMinor(42750) }],
          quotas: { GUICHET: 35, EN_LIGNE: 20, RESERVE_COMPAGNIE: 5 },
        },
        {
          label: "Matadi→Kinshasa VIP",
          routeIndex: 1,
          busIndex: 0,
          agencyIndex: 1,
          hour: 15,
          mode: "HORAIRE_FIXE",
          prices: [{ category: "VIP", priceUsd: toMinor(25), priceCdf: toMinor(71250) }],
          quotas: { GUICHET: 35, EN_LIGNE: 20, RESERVE_COMPAGNIE: 5 },
        },
        // §2.2 : un départ à remplissage, invisible en ligne, quota 100 % guichet.
        {
          label: "Kinshasa→Kikwit à remplissage",
          routeIndex: 2,
          busIndex: 2,
          agencyIndex: 0,
          hour: 8,
          mode: "DEPART_A_REMPLISSAGE",
          prices: [{ category: "STANDARD", priceUsd: toMinor(22), priceCdf: toMinor(62700) }],
          quotas: { GUICHET: 64, EN_LIGNE: 0, RESERVE_COMPAGNIE: 4 },
        },
      ],
      daysAhead: 7,
    },
    {
      name: "Route d'Or",
      commissionRate: 0.08,
      currencyRateUsdCdf: 2870,
      agencies: [
        { name: "Gare de Lubumbashi", city: "Lubumbashi", address: "Avenue Mobutu, Lubumbashi" },
        { name: "Agence Kolwezi", city: "Kolwezi", address: "Route de la Gécamines, Kolwezi" },
      ],
      staff: [
        { phone: "+243810000006", name: "Direction Route d'Or", role: "ADMIN_COMPAGNIE", agencyIndex: null },
        { phone: "+243810000007", name: "Chef de gare Lubumbashi", role: "GERANT_AGENCE", agencyIndex: 0 },
        { phone: "+243810000008", name: "Guichetier Lubumbashi", role: "GUICHETIER", agencyIndex: 0 },
        { phone: "+243810000009", name: "Contrôleur Route d'Or", role: "CONTROLEUR", agencyIndex: 0 },
      ],
      seatMaps: [{ name: "Minibus 1+2 — 45 places", rows: 15, layout: LAYOUT_PRESETS["1+2"], disabledSeats: [] }],
      buses: [
        { plateNumber: "LU 1023 GH", seatMapIndex: 0, category: "VIP" },
        { plateNumber: "LU 4477 IJ", seatMapIndex: 0, category: "STANDARD" },
        { plateNumber: "LU 8890 KL", seatMapIndex: 0, category: "VIP" },
        { plateNumber: "LU 2200 MN", seatMapIndex: 0, category: "STANDARD" },
      ],
      routes: [
        { originCity: "Lubumbashi", destinationCity: "Kolwezi", distanceKm: 350, durationEstMin: 300 },
        { originCity: "Kolwezi", destinationCity: "Lubumbashi", distanceKm: 350, durationEstMin: 300 },
      ],
      tripTemplates: [
        {
          label: "Lubumbashi→Kolwezi VIP",
          routeIndex: 0,
          busIndex: 0,
          agencyIndex: 0,
          hour: 7,
          mode: "HORAIRE_FIXE",
          prices: [{ category: "VIP", priceUsd: toMinor(20), priceCdf: toMinor(57400) }],
          quotas: { GUICHET: 25, EN_LIGNE: 15, RESERVE_COMPAGNIE: 5 },
        },
        {
          label: "Kolwezi→Lubumbashi matinal VIP",
          routeIndex: 1,
          busIndex: 2,
          agencyIndex: 1,
          hour: 6,
          minute: 30,
          mode: "HORAIRE_FIXE",
          prices: [{ category: "VIP", priceUsd: toMinor(20), priceCdf: toMinor(57400) }],
          quotas: { GUICHET: 25, EN_LIGNE: 15, RESERVE_COMPAGNIE: 5 },
        },
        {
          label: "Kolwezi→Lubumbashi standard",
          routeIndex: 1,
          busIndex: 1,
          agencyIndex: 1,
          hour: 14,
          mode: "HORAIRE_FIXE",
          prices: [{ category: "STANDARD", priceUsd: toMinor(14), priceCdf: toMinor(40180) }],
          quotas: { GUICHET: 25, EN_LIGNE: 15, RESERVE_COMPAGNIE: 5 },
        },
        {
          label: "Kolwezi→Lubumbashi soir",
          routeIndex: 1,
          busIndex: 3,
          agencyIndex: 1,
          hour: 19,
          mode: "HORAIRE_FIXE",
          prices: [{ category: "STANDARD", priceUsd: toMinor(14), priceCdf: toMinor(40180) }],
          quotas: { GUICHET: 25, EN_LIGNE: 15, RESERVE_COMPAGNIE: 5 },
        },
      ],
      daysAhead: 7,
    },
  ];

  const summaries: CompanySummary[] = [];
  for (const plan of plans) {
    summaries.push(await seedCompany(plan, now));
  }

  const counts = (await db
    .prepare<{ trajets: number; sieges: number; utilisateurs: number }>(
      `SELECT (SELECT COUNT(*) FROM trips) AS trajets,
              (SELECT COUNT(*) FROM trip_seats) AS sieges,
              (SELECT COUNT(*) FROM users) AS utilisateurs`,
    )
    .get()) as { trajets: number; sieges: number; utilisateurs: number };

  console.log("Jeu de démonstration créé.");
  console.log(`  Compagnies  : ${summaries.map((s) => s.name).join(", ")}`);
  console.log(`  Trajets     : ${counts.trajets}`);
  console.log(`  Sièges      : ${counts.sieges}`);
  console.log(`  Utilisateurs: ${counts.utilisateurs}`);
  console.log("");
  console.log("Comptes staff — mot de passe commun : " + MOT_DE_PASSE_DEMO);
  console.log(`  ${superAdmin.phone}  SUPER_ADMIN      ${superAdmin.name}`);
  for (const summary of summaries) {
    console.log(`  — ${summary.name} (${summary.agencyNames.join(", ")}) —`);
    for (const person of summary.staff) {
      console.log(`  ${person.phone}  ${person.role.padEnd(16)} ${person.name}`);
    }
  }
  console.log("");
  console.log("Passager : aucun compte à créer, connexion par OTP SMS.");
  console.log("En développement, le code OTP est affiché à l'écran.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    const { closeDb } = await import("@/lib/db");
    await closeDb();
  });
