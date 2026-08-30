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
import type { BusCategory, DepartureMode, SeatMapLayout, VehicleType } from "@/lib/domain/types";
import { LAYOUT_PRESETS } from "@/lib/domain/seat-map";
import { createSeatMap, createBus, createRoute, createTrip } from "@/lib/domain/planning";
import { createPartnerApplication, reviewPartnerApplication } from "@/lib/domain/partners";
import { updateCompanyProfile } from "@/lib/domain/directory";
import { createSchedule } from "@/lib/domain/schedules";
import { createReservation } from "@/lib/domain/reservations";
import {
  initiateReservationPayment,
  settleReservationPayment,
} from "@/lib/domain/reservation-payments";
import { setCompanyModules } from "@/lib/domain/access";
import { MODULES_COMPLETS, MODULES_PAR_DEFAUT, type CompanyModule } from "@/lib/domain/modules";
import { todayInKinshasa, addDays, isoWeekday } from "@/lib/core/time";
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
  buses: Array<{ plateNumber: string; seatMapIndex: number; category: BusCategory; vehicleType?: VehicleType }>;
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
      vehicleType: bus.vehicleType,
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

/**
 * Phase 1 — une agence référencée qui n'a rien numérisé.
 *
 * Ni plan de sièges, ni bus immatriculé, ni trajet daté : uniquement une fiche
 * publique et des horaires. C'est le cas le plus fréquent au démarrage, et
 * celui que le produit doit servir sans rien exiger de plus.
 */
type AgenceReferenceePlan = {
  name: string;
  contactName: string;
  phone: string;
  whatsapp: string;
  city: string;
  address: string;
  description: string;
  services: string;
  /** Phases ouvertes par Mobembo pour cette agence. */
  modules?: CompanyModule[];
  schedules: Array<{
    originCity: string;
    destinationCity: string;
    departureTime: string;
    days: number[];
    priceUsd?: number;
    priceCdf?: number;
    boardingPoint: string;
    durationEstMin?: number;
    vehicleLabel?: string;
    notes?: string;
    bookingEnabled?: boolean;
    onlineQuota?: number;
  }>;
};

async function seedAgenceReferencee(
  plan: AgenceReferenceePlan,
  now: string,
  superAdminUserId: string,
): Promise<{ companyId: string; phone: string; name: string }> {
  const companyId = newId("cmp");
  const agencyId = newId("agc");
  const userId = newId("usr");

  await tx(async (t) => {
    await t
      .prepare(
        `INSERT INTO companies
         (id, name, logo, status, kind, commission_rate, currency_rate_usd_cdf, currency_rate_at,
          qr_secret, policy_json, created_at)
       VALUES (?, ?, NULL, 'ACTIVE', 'COMPAGNIE', 0.06, 2850, ?, ?, ?, ?)`,
      )
      .run(companyId, plan.name, now, randomBytes(32).toString("hex"), JSON.stringify(DEFAULT_POLICY), now);
    await t
      .prepare(
        `INSERT INTO agencies
         (id, company_id, name, city, address, gps, opening_hours, status, ticket_sequence, created_at)
       VALUES (?, ?, ?, ?, ?, NULL, '06:00-18:00', 'ACTIVE', 0, ?)`,
      )
      .run(agencyId, companyId, `${plan.name} — ${plan.city}`, plan.city, plan.address, now);
    await t
      .prepare(
        `INSERT INTO users (id, phone, name, password_hash, status, locale, created_at)
       VALUES (?, ?, ?, ?, 'ACTIVE', 'fr', ?)`,
      )
      .run(userId, plan.phone, plan.contactName, hashPassword(MOT_DE_PASSE_DEMO), now);
    await t
      .prepare(
        `INSERT INTO user_roles (id, user_id, role, company_id, agency_id, created_at)
       VALUES (?, ?, 'ADMIN_COMPAGNIE', ?, NULL, ?)`,
      )
      .run(newId("url"), userId, companyId, now);
    await t
      .prepare(
        `INSERT INTO user_roles (id, user_id, role, company_id, agency_id, created_at)
       VALUES (?, ?, 'GERANT_AGENCE', ?, ?, ?)`,
      )
      .run(newId("url"), userId, companyId, agencyId, now);
  });

  await setCompanyModules({
    companyId,
    modules: plan.modules ?? MODULES_PAR_DEFAUT,
    actor: { userId: superAdminUserId, role: "SUPER_ADMIN" },
  });

  await updateCompanyProfile({
    companyId,
    description: plan.description,
    phone: plan.phone,
    whatsapp: plan.whatsapp,
    headOfficeCity: plan.city,
    address: plan.address,
    services: plan.services,
    actor: { userId: superAdminUserId, role: "SUPER_ADMIN" },
  });

  for (const horaire of plan.schedules) {
    await createSchedule({
      companyId,
      agencyId,
      originCity: horaire.originCity,
      destinationCity: horaire.destinationCity,
      departureTime: horaire.departureTime,
      days: horaire.days,
      priceUsd: horaire.priceUsd ? toMinor(horaire.priceUsd) : null,
      priceCdf: horaire.priceCdf ? toMinor(horaire.priceCdf) : null,
      boardingPoint: horaire.boardingPoint,
      durationEstMin: horaire.durationEstMin ?? null,
      vehicleLabel: horaire.vehicleLabel ?? null,
      notes: horaire.notes ?? null,
      bookingEnabled: horaire.bookingEnabled ?? false,
      onlineQuota: horaire.onlineQuota ?? 0,
      actor: { userId, role: "ADMIN_COMPAGNIE" },
    });
  }

  return { companyId, phone: plan.phone, name: plan.contactName };
}

async function main(): Promise<void> {
  const db = getDb();
  await resetDb();
  const now = nowIso();

  // Compte plateforme, commun à toutes les compagnies (§1.5 : rôle SUPER_ADMIN
  // sans company_id).
  const superAdmin = { phone: "+243810000001", name: "Équipe plateforme" };
  const superAdminUserId = newId("usr");
  await tx(async (t) => {
    const userId = superAdminUserId;
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
      seatMaps: [
        { name: "Minibus 1+2 — 45 places", rows: 15, layout: LAYOUT_PRESETS["1+2"], disabledSeats: [] },
        { name: "Berline 4 places", rows: 1, layout: LAYOUT_PRESETS["Voiture — sans couloir"], disabledSeats: [] },
      ],
      buses: [
        { plateNumber: "LU 1023 GH", seatMapIndex: 0, category: "VIP" },
        { plateNumber: "LU 4477 IJ", seatMapIndex: 0, category: "STANDARD" },
        { plateNumber: "LU 8890 KL", seatMapIndex: 0, category: "VIP" },
        { plateNumber: "LU 2200 MN", seatMapIndex: 0, category: "STANDARD" },
        { plateNumber: "LU 6600 VX", seatMapIndex: 1, category: "STANDARD", vehicleType: "VOITURE" },
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
        // Voiture express : même axe, capacité (4 places) et quotas à l'échelle.
        {
          label: "Kolwezi→Lubumbashi voiture express",
          routeIndex: 1,
          busIndex: 4,
          agencyIndex: 1,
          hour: 10,
          mode: "HORAIRE_FIXE",
          prices: [{ category: "STANDARD", priceUsd: toMinor(16), priceCdf: toMinor(45920) }],
          quotas: { GUICHET: 2, EN_LIGNE: 2, RESERVE_COMPAGNIE: 0 },
        },
      ],
      daysAhead: 7,
    },
  ];

  const summaries: CompanySummary[] = [];
  for (const plan of plans) {
    summaries.push(await seedCompany(plan, now));
  }

  // Chauffeur indépendant : passe par le même circuit qu'une compagnie
  // (candidature → validation SUPER_ADMIN) — exerce le vrai chemin de code
  // d'onboarding plutôt que d'insérer directement en base.
  const independant = { phone: "+243810000010", name: "Fiston Kalala" };
  const candidatureIndependant = await createPartnerApplication({
    applicationType: "INDEPENDANT",
    contactName: independant.name,
    phone: independant.phone,
    city: "Kinshasa",
    destinations: "Kinshasa, Boma",
  });
  await reviewPartnerApplication({
    applicationId: candidatureIndependant.id,
    decision: "APPROUVER",
    initialPassword: MOT_DE_PASSE_DEMO,
    actor: { userId: superAdminUserId, role: "SUPER_ADMIN" },
  });

  // ---------------------------------------------------------------------
  // Phase 1 & 2 : la fiche publique des compagnies déjà numérisées, puis deux
  // agences qui n'ont, elles, rien numérisé du tout. Le jeu de démonstration
  // doit contenir les deux, sinon la promesse « vous n'êtes obligé à rien »
  // n'est vérifiable nulle part.
  // ---------------------------------------------------------------------
  const fiches = [
    {
      companyId: summaries[0].companyId,
      description:
        "Transport interurbain sur l'axe Kinshasa – Kongo-Central depuis 2008. Départs quotidiens en autocar, bagages inclus.",
      phone: "+243810000002",
      whatsapp: "+243810000002",
      headOfficeCity: "Kinshasa",
      address: "Boulevard Lumumba, Limete, Kinshasa",
      services: "Bagage de 20 kg inclus\nTransport de colis\nAutocar climatisé\nBillet QR et paiement Mobile Money",
    },
    {
      companyId: summaries[1]?.companyId,
      description:
        "Liaisons régulières vers l'intérieur du pays, en bus et en voiture express selon l'axe.",
      phone: "+243810000006",
      whatsapp: "+243810000006",
      headOfficeCity: "Kinshasa",
      address: "Avenue Kasa-Vubu, Kinshasa",
      services: "Voiture express\nDéparts matinaux\nTransport de colis",
    },
  ].filter((fiche) => fiche.companyId);

  // §29 : chaque agence n'a que les phases qu'elle utilise. Les deux compagnies
  // historiques exploitent la billetterie complète ; les agences référencées
  // plus bas n'ont que le socle, et c'est ce contraste qui rend la démo utile.
  for (const summary of summaries) {
    await setCompanyModules({
      companyId: summary.companyId,
      modules: MODULES_COMPLETS,
      actor: { userId: superAdminUserId, role: "SUPER_ADMIN" },
    });
  }

  for (const fiche of fiches) {
    await updateCompanyProfile({
      companyId: fiche.companyId!,
      description: fiche.description,
      phone: fiche.phone,
      whatsapp: fiche.whatsapp,
      headOfficeCity: fiche.headOfficeCity,
      address: fiche.address,
      services: fiche.services,
      actor: { userId: superAdminUserId, role: "SUPER_ADMIN" },
    });
  }

  const agencesReferencees = [
    await seedAgenceReferencee(
      {
        name: "Kongo Express",
        contactName: "Mamie Nsimba",
        phone: "+243810000020",
        whatsapp: "+243810000020",
        city: "Kinshasa",
        address: "Rond-point Ngaba, avenue de la Libération",
        description:
          "Agence familiale sur l'axe Kinshasa – Matadi. Nous vendons nos billets à l'agence et par téléphone. Nos horaires sont publiés ici pour que vous sachiez à quoi vous attendre.",
        services: "Bagage de 25 kg inclus\nTransport de colis vers Matadi\nDépart garanti même à moitié plein",
        // Phase 1 stricte : référencement seul, pas même la réservation.
        modules: [],
        schedules: [
          {
            originCity: "Kinshasa",
            destinationCity: "Matadi",
            departureTime: "06:30",
            days: [1, 2, 3, 4, 5, 6],
            priceUsd: 22,
            priceCdf: 62000,
            boardingPoint: "Rond-point Ngaba, devant la station",
            durationEstMin: 330,
            vehicleLabel: "Bus 60 places",
            notes: "Présentez-vous 45 minutes avant le départ. Un arrêt repas à Kisantu.",
          },
          {
            originCity: "Matadi",
            destinationCity: "Kinshasa",
            departureTime: "07:00",
            days: [1, 2, 3, 4, 5, 6],
            priceUsd: 22,
            priceCdf: 62000,
            boardingPoint: "Avenue du Port, en face du marché",
            durationEstMin: 330,
            vehicleLabel: "Bus 60 places",
          },
          {
            originCity: "Kinshasa",
            destinationCity: "Kikwit",
            departureTime: "05:00",
            days: [2, 5],
            priceUsd: 35,
            boardingPoint: "Rond-point Ngaba, devant la station",
            durationEstMin: 600,
            notes: "Deux départs par semaine seulement. Appelez la veille pour confirmer.",
          },
        ],
      },
      now,
      superAdminUserId,
    ),
    await seedAgenceReferencee(
      {
        name: "Étoile du Kasaï",
        contactName: "Papy Tshibangu",
        phone: "+243810000021",
        whatsapp: "+243810000021",
        city: "Kinshasa",
        address: "Marché de la Liberté, Masina",
        description:
          "Nous ouvrons quelques places à la réservation sur Mobembo pour les voyageurs qui viennent de loin, avec paiement Mobile Money à l'avance. Le reste du bus se vend au guichet comme avant.",
        services: "Bagage de 30 kg inclus\nSièges à l'avant sur demande",
        modules: ["RESERVATION", "PAIEMENT"],
        schedules: [
          {
            originCity: "Kinshasa",
            destinationCity: "Matadi",
            departureTime: "09:30",
            days: [1, 2, 3, 4, 5, 6, 7],
            priceUsd: 25,
            priceCdf: 71000,
            boardingPoint: "Marché de la Liberté, Masina",
            durationEstMin: 320,
            vehicleLabel: "Bus climatisé 55 places",
            notes: "Réservation en ligne possible : payez à l'agence le jour du départ.",
            bookingEnabled: true,
            onlineQuota: 8,
          },
          {
            originCity: "Kinshasa",
            destinationCity: "Kikwit",
            departureTime: "06:00",
            days: [1, 3, 5],
            priceUsd: 38,
            boardingPoint: "Marché de la Liberté, Masina",
            durationEstMin: 580,
            bookingEnabled: true,
            onlineQuota: 5,
          },
        ],
      },
      now,
      superAdminUserId,
    ),
  ];

  // Deux réservations de démonstration sur le prochain départ ouvert, pour que
  // l'écran « Réservations » de l'agence ne soit pas vide au premier accès.
  const horaireOuvert = (await db
    .prepare<{ id: string; days_of_week: string }>(
      `SELECT id, days_of_week FROM schedules WHERE booking_enabled = 1 ORDER BY online_quota DESC LIMIT 1`,
    )
    .get()) as { id: string; days_of_week: string } | undefined;
  if (horaireOuvert) {
    const jours = horaireOuvert.days_of_week.split(",").map(Number);
    let date = addDays(todayInKinshasa(), 1);
    for (let essai = 0; essai < 8 && !jours.includes(isoWeekday(date)); essai++) {
      date = addDays(date, 1);
    }
    if (jours.includes(isoWeekday(date))) {
      await createReservation({
        scheduleId: horaireOuvert.id,
        travelDate: date,
        passengerName: "Grâce Mbuyi",
        passengerPhone: "+243990000001",
        seats: 2,
      });
      const payee = await createReservation({
        scheduleId: horaireOuvert.id,
        travelDate: date,
        passengerName: "Jonas Ilunga",
        passengerPhone: "+243990000002",
        seats: 1,
      });

      // Phase 3 : un billet numérique émis, pour que l'écran « Paiements et
      // billets » et « Mes billets » aient de quoi montrer dès le premier accès.
      // L'opérateur simulé confirme au premier polling (§5.2).
      const paiement = await initiateReservationPayment({
        reservationId: payee.id,
        provider: "MPESA",
        payerPhone: "+243990000002",
        idempotencyKey: `seed-${payee.id}`,
      });
      if (paiement.payment.status === "INITIE") {
        await settleReservationPayment(paiement.payment.id, "CONFIRME", { source: "seed" });
      }
    }
  }

  const counts = (await db
    .prepare<{
      trajets: number;
      sieges: number;
      utilisateurs: number;
      horaires: number;
      reservations: number;
      billetsReservation: number;
    }>(
      `SELECT (SELECT COUNT(*) FROM trips) AS trajets,
              (SELECT COUNT(*) FROM trip_seats) AS sieges,
              (SELECT COUNT(*) FROM users) AS utilisateurs,
              (SELECT COUNT(*) FROM schedules) AS horaires,
              (SELECT COUNT(*) FROM schedule_bookings) AS reservations,
              (SELECT COUNT(*) FROM schedule_tickets) AS billetsReservation`,
    )
    .get()) as {
    trajets: number;
    sieges: number;
    utilisateurs: number;
    horaires: number;
    reservations: number;
    billetsReservation: number;
  };

  console.log("Jeu de démonstration créé.");
  console.log(`  Compagnies  : ${summaries.map((s) => s.name).join(", ")}`);
  console.log(`  Trajets     : ${counts.trajets}`);
  console.log(`  Sièges      : ${counts.sieges}`);
  console.log(`  Horaires    : ${counts.horaires} (phase 1, sans bus ni sièges)`);
  console.log(`  Réservations: ${counts.reservations} (phase 2, sans paiement)`);
  console.log(`  Billets payés: ${counts.billetsReservation} (phase 3, QR sans siège)`);
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
  console.log(`  — Indépendant —`);
  {
    const roles = ["ADMIN_COMPAGNIE", "GERANT_AGENCE", "GUICHETIER"];
    for (const role of roles) {
      console.log(`  ${independant.phone}  ${role.padEnd(16)} ${independant.name}`);
    }
  }
  console.log(`  — Agences référencées seulement (phase 1) —`);
  for (const agence of agencesReferencees) {
    console.log(`  ${agence.phone}  ADMIN_COMPAGNIE  ${agence.name}`);
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
