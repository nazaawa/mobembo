import test, { after } from "node:test";
import assert from "node:assert/strict";
import { closeDb, getDb } from "@/lib/db";
import { toMinor } from "@/lib/core/money";
import { addDays, isoWeekday, todayInKinshasa } from "@/lib/core/time";
import { DomainError } from "@/lib/core/errors";
import {
  createSchedule,
  quickUpdateSchedule,
  scheduleAvailability,
  searchSchedules,
  setScheduleStatus,
} from "@/lib/domain/schedules";
import {
  cancelReservation,
  createReservation,
  passengerReservations,
  settleFinishedReservations,
} from "@/lib/domain/reservations";
import { publicAgencyBySlug, publicDirectory, updateCompanyProfile } from "@/lib/domain/directory";
import { coveredAxes, searchOffers, searchableCities } from "@/lib/domain/offers";
import {
  companyAccess,
  hasModule,
  requireModule,
  setAdvancedView,
  setCompanyModules,
  showsModule,
} from "@/lib/domain/access";
import { seedFixture, type Fixture } from "./helpers";

after(async () => closeDb());

const actor = { userId: "usr_test", role: "ADMIN_COMPAGNIE" };

/** Prochaine date où un service circulant tous les jours part encore. */
function demain(): string {
  return addDays(todayInKinshasa(), 1);
}

async function publierHoraire(
  fixture: Fixture,
  overrides: Partial<Parameters<typeof createSchedule>[0]> = {},
) {
  return createSchedule({
    companyId: fixture.companyId,
    agencyId: fixture.agencyId,
    originCity: "Kinshasa",
    destinationCity: "Matadi",
    departureTime: "06:30",
    days: [1, 2, 3, 4, 5, 6, 7],
    priceUsd: toMinor(22),
    boardingPoint: "Rond-point Ngaba",
    actor: { userId: fixture.gerantId, role: "GERANT_AGENCE" },
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Phase 1 — référencement et recherche
// ---------------------------------------------------------------------------

test("Phase 1 — un trajet se publie sans bus, sans plan de sièges et dans une seule devise", async () => {
  const fixture = await seedFixture();
  const horaire = await publierHoraire(fixture, { priceCdf: null });

  assert.equal(horaire.status, "PUBLIE");
  assert.equal(horaire.price_cdf, null);
  // Le point de tout l'exercice : rien de la billetterie complète n'a été exigé.
  assert.equal(horaire.booking_enabled, 0);
  assert.equal(horaire.online_quota, 0);
});

test("Phase 1 — un trajet sans aucun prix est refusé", async () => {
  const fixture = await seedFixture();
  await assert.rejects(
    () => publierHoraire(fixture, { priceUsd: null, priceCdf: null }),
    (error: DomainError) => error.code === "REQUETE_INVALIDE",
  );
});

test("Phase 1 — un trajet ne s'affiche que les jours où il circule", async () => {
  const fixture = await seedFixture();
  const lundi = 1;
  await publierHoraire(fixture, { days: [lundi] });

  const jour = todayInKinshasa();
  const resultats = await searchSchedules({
    origin: "Kinshasa",
    destination: "Matadi",
    day: jour,
  });
  assert.equal(resultats.length, isoWeekday(jour) === lundi ? 1 : 0);
});

test("Phase 1 — la recherche fusionne trajets vendus en ligne et horaires publiés", async () => {
  const fixture = await seedFixture({ departureInHours: 24 });
  const jourDuTrajet = todayInKinshasa(
    new Date(Date.now() + 24 * 3_600_000),
  );
  await publierHoraire(fixture, { departureTime: "23:45" });

  const offres = await searchOffers({
    origin: "Kinshasa",
    destination: "Matadi",
    day: jourDuTrajet,
  });

  assert.ok(offres.some((offre) => offre.kind === "TRAJET" && offre.bookingMode === "SIEGE"));
  assert.ok(offres.some((offre) => offre.kind === "HORAIRE" && offre.bookingMode === "CONTACT"));
  // Une seule liste, triée par heure : le voyageur ne voit pas deux produits.
  const heures = offres.map((offre) => new Date(offre.depart).getTime());
  assert.deepEqual(heures, [...heures].sort((a, b) => a - b));
});

test("Phase 1 — une ville desservie par un seul horaire devient cherchable", async () => {
  const fixture = await seedFixture();
  await publierHoraire(fixture, { destinationCity: "Boma" });
  const villes = await searchableCities();
  assert.ok(villes.includes("Boma"));
});

test("Phase 1 — un horaire suspendu quitte la recherche et porte son motif", async () => {
  const fixture = await seedFixture();
  const horaire = await publierHoraire(fixture);
  await setScheduleStatus({
    scheduleId: horaire.id,
    companyId: fixture.companyId,
    status: "SUSPENDU",
    reason: "Véhicule immobilisé",
    actor,
  });

  const resultats = await searchSchedules({
    origin: "Kinshasa",
    destination: "Matadi",
    day: todayInKinshasa(),
  });
  assert.equal(resultats.length, 0);

  const row = await getDb()
    .prepare<{ suspended_reason: string }>(`SELECT suspended_reason FROM schedules WHERE id = ?`)
    .get(horaire.id);
  assert.equal(row?.suspended_reason, "Véhicule immobilisé");
});

test("Phase 1 — une suspension sans motif est refusée", async () => {
  const fixture = await seedFixture();
  const horaire = await publierHoraire(fixture);
  await assert.rejects(
    () =>
      setScheduleStatus({
        scheduleId: horaire.id,
        companyId: fixture.companyId,
        status: "SUSPENDU",
        reason: "   ",
        actor,
      }),
    (error: DomainError) => error.code === "REQUETE_INVALIDE",
  );
});

test("Phase 1 — la mise à jour rapide change le prix et repousse la date de fraîcheur", async () => {
  const fixture = await seedFixture();
  const horaire = await publierHoraire(fixture);
  // Deux mises à jour distinctes doivent produire deux horodatages distincts.
  await new Promise((resolve) => setTimeout(resolve, 1100));

  const modifie = await quickUpdateSchedule({
    scheduleId: horaire.id,
    companyId: fixture.companyId,
    priceUsd: toMinor(24),
    departureTime: "07:15",
    actor,
  });

  assert.equal(modifie.price_usd, toMinor(24));
  assert.equal(modifie.departure_time, "07:15");
  assert.ok(modifie.updated_at > horaire.updated_at, "la date de mise à jour doit avancer");
  // Le reste de la fiche est intact : §5.5 ne demande que le champ qui change.
  assert.equal(modifie.boarding_point, horaire.boarding_point);
  assert.equal(modifie.days_of_week, horaire.days_of_week);
});

test("Phase 1 — un horaire d'une autre compagnie ne se modifie pas", async () => {
  const fixture = await seedFixture();
  const horaire = await publierHoraire(fixture);
  await assert.rejects(
    () =>
      quickUpdateSchedule({
        scheduleId: horaire.id,
        companyId: "cmp_intrus",
        priceUsd: toMinor(1),
        actor,
      }),
    (error: DomainError) => error.code === "INTERDIT",
  );
});

test("Phase 1 — la fiche agence expose contact, villes et horaires", async () => {
  const fixture = await seedFixture();
  await publierHoraire(fixture);
  const fiche = await updateCompanyProfile({
    companyId: fixture.companyId,
    phone: "0812345678",
    whatsapp: "0812345678",
    description: "Départs quotidiens vers le Kongo-Central.",
    address: "Boulevard Lumumba",
    actor,
  });

  assert.equal(fiche.phone, "+243812345678", "le numéro est normalisé une fois pour toutes");
  assert.ok(fiche.slug, "un slug est attribué à la première publication de la fiche");

  const publique = await publicAgencyBySlug(fiche.slug!);
  assert.ok(publique);
  assert.deepEqual(publique!.villes, ["Kinshasa", "Matadi"]);
  assert.equal(publique!.compagnie.phone, "+243812345678");
});

test("Phase 1 — une agence retirée de l'annuaire n'a plus de fiche publique", async () => {
  const fixture = await seedFixture();
  const fiche = await updateCompanyProfile({ companyId: fixture.companyId, phone: "0810000000", actor });
  await getDb().prepare(`UPDATE companies SET listed = 0 WHERE id = ?`).run(fixture.companyId);

  assert.equal(await publicAgencyBySlug(fiche.slug!), null);
  const annuaire = await publicDirectory();
  assert.equal(annuaire.filter((entree) => entree.id === fixture.companyId).length, 0);
});

test("Phase 1 — l'annuaire compte les départs programmés d'une agence sans horaire publié", async () => {
  const fixture = await seedFixture();
  const annuaire = await publicDirectory();
  const entree = annuaire.find((row) => row.id === fixture.companyId);
  assert.ok(entree);
  assert.equal(entree!.horaires, 0);
  assert.ok(entree!.departsPlanifies > 0, "le trajet de la fixture doit être compté");
});

test("Phase 1 — les axes couverts réunissent les deux modèles", async () => {
  const fixture = await seedFixture();
  await publierHoraire(fixture, { destinationCity: "Kikwit", priceUsd: toMinor(35) });
  const axes = await coveredAxes(todayInKinshasa(), 10);

  const versMatadi = axes.find((axe) => axe.destination === "Matadi");
  const versKikwit = axes.find((axe) => axe.destination === "Kikwit");
  assert.ok(versMatadi, "l'axe du trajet complet doit apparaître");
  assert.ok(versKikwit, "l'axe publié en horaire doit apparaître");
  assert.equal(versKikwit!.reservationEnLigne, false);
});

// ---------------------------------------------------------------------------
// Phase 2 — réservation sur quota
// ---------------------------------------------------------------------------

test("Phase 2 — ouvrir la réservation sans quota est refusé", async () => {
  const fixture = await seedFixture();
  await assert.rejects(
    () => publierHoraire(fixture, { bookingEnabled: true, onlineQuota: 0 }),
    (error: DomainError) => error.code === "REQUETE_INVALIDE",
  );
});

test("Phase 2 — réserver retire la place du quota du jour, et de ce jour seulement", async () => {
  const fixture = await seedFixture();
  const horaire = await publierHoraire(fixture, { bookingEnabled: true, onlineQuota: 4 });
  const date = demain();

  await createReservation({
    scheduleId: horaire.id,
    travelDate: date,
    passengerName: "Grâce Mbuyi",
    passengerPhone: "0991111111",
    seats: 3,
  });

  const jourReserve = await scheduleAvailability(horaire.id, date);
  assert.deepEqual(jourReserve, { quota: 4, reservees: 3, restantes: 1 });

  // §12 : le quota est par départ, pas global.
  const surlendemain = await scheduleAvailability(horaire.id, addDays(date, 1));
  assert.equal(surlendemain.restantes, 4);
});

test("Phase 2 — le quota épuisé refuse la réservation suivante", async () => {
  const fixture = await seedFixture();
  const horaire = await publierHoraire(fixture, { bookingEnabled: true, onlineQuota: 2 });
  const date = demain();

  await createReservation({
    scheduleId: horaire.id,
    travelDate: date,
    passengerName: "Premier",
    passengerPhone: "0991111111",
    seats: 2,
  });

  await assert.rejects(
    () =>
      createReservation({
        scheduleId: horaire.id,
        travelDate: date,
        passengerName: "Second",
        passengerPhone: "0992222222",
        seats: 1,
      }),
    (error: DomainError) => error.code === "QUOTA_EPUISE",
  );
});

test("Phase 2 — demander plus de places qu'il n'en reste dit combien il en reste", async () => {
  const fixture = await seedFixture();
  const horaire = await publierHoraire(fixture, { bookingEnabled: true, onlineQuota: 3 });
  const date = demain();
  await createReservation({
    scheduleId: horaire.id,
    travelDate: date,
    passengerName: "Premier",
    passengerPhone: "0991111111",
    seats: 2,
  });

  await assert.rejects(
    () =>
      createReservation({
        scheduleId: horaire.id,
        travelDate: date,
        passengerName: "Second",
        passengerPhone: "0992222222",
        seats: 2,
      }),
    (error: DomainError) =>
      error.code === "QUOTA_INSUFFISANT" && error.message.includes("1 place"),
  );
});

test("Phase 2 — un horaire non ouvert à la réservation renvoie vers l'agence", async () => {
  const fixture = await seedFixture();
  const horaire = await publierHoraire(fixture);
  await assert.rejects(
    () =>
      createReservation({
        scheduleId: horaire.id,
        travelDate: demain(),
        passengerName: "Voyageur",
        passengerPhone: "0991111111",
        seats: 1,
      }),
    (error: DomainError) => error.code === "RESERVATION_FERMEE",
  );
});

test("Phase 2 — réserver un jour où le service ne circule pas est refusé", async () => {
  const fixture = await seedFixture();
  const date = demain();
  // Ouvre le service sur tous les jours SAUF celui qu'on va demander.
  const jours = [1, 2, 3, 4, 5, 6, 7].filter((jour) => jour !== isoWeekday(date));
  const horaire = await publierHoraire(fixture, {
    days: jours,
    bookingEnabled: true,
    onlineQuota: 5,
  });

  await assert.rejects(
    () =>
      createReservation({
        scheduleId: horaire.id,
        travelDate: date,
        passengerName: "Voyageur",
        passengerPhone: "0991111111",
        seats: 1,
      }),
    (error: DomainError) => error.code === "REQUETE_INVALIDE",
  );
});

test("Phase 2 — un même numéro ne réserve pas deux fois le même départ", async () => {
  const fixture = await seedFixture();
  const horaire = await publierHoraire(fixture, { bookingEnabled: true, onlineQuota: 10 });
  const date = demain();
  await createReservation({
    scheduleId: horaire.id,
    travelDate: date,
    passengerName: "Voyageur",
    passengerPhone: "0991111111",
    seats: 1,
  });

  await assert.rejects(
    () =>
      createReservation({
        scheduleId: horaire.id,
        travelDate: date,
        passengerName: "Voyageur",
        passengerPhone: "+243991111111",
        seats: 1,
      }),
    (error: DomainError) => error.code === "RESERVATION_EXISTANTE",
  );
});

test("Phase 2 — annuler libère la place immédiatement", async () => {
  const fixture = await seedFixture();
  const horaire = await publierHoraire(fixture, { bookingEnabled: true, onlineQuota: 2 });
  const date = demain();
  const reservation = await createReservation({
    scheduleId: horaire.id,
    travelDate: date,
    passengerName: "Voyageur",
    passengerPhone: "0991111111",
    seats: 2,
  });

  assert.equal((await scheduleAvailability(horaire.id, date)).restantes, 0);
  await cancelReservation({
    reservationId: reservation.id,
    by: "VOYAGEUR",
    phone: "0991111111",
  });
  assert.equal((await scheduleAvailability(horaire.id, date)).restantes, 2);
});

test("Phase 2 — un autre numéro ne peut pas annuler la réservation", async () => {
  const fixture = await seedFixture();
  const horaire = await publierHoraire(fixture, { bookingEnabled: true, onlineQuota: 4 });
  const reservation = await createReservation({
    scheduleId: horaire.id,
    travelDate: demain(),
    passengerName: "Voyageur",
    passengerPhone: "0991111111",
    seats: 1,
  });

  await assert.rejects(
    () =>
      cancelReservation({
        reservationId: reservation.id,
        by: "VOYAGEUR",
        phone: "0992222222",
      }),
    (error: DomainError) => error.code === "INTERDIT",
  );
});

test("Phase 2 — l'agence doit motiver son annulation, et le motif part par SMS", async () => {
  const fixture = await seedFixture();
  const horaire = await publierHoraire(fixture, { bookingEnabled: true, onlineQuota: 4 });
  const reservation = await createReservation({
    scheduleId: horaire.id,
    travelDate: demain(),
    passengerName: "Voyageur",
    passengerPhone: "0991111111",
    seats: 1,
  });

  await assert.rejects(
    () =>
      cancelReservation({
        reservationId: reservation.id,
        by: "AGENCE",
        companyId: fixture.companyId,
        actor,
      }),
    (error: DomainError) => error.code === "REQUETE_INVALIDE",
  );

  await cancelReservation({
    reservationId: reservation.id,
    by: "AGENCE",
    reason: "Véhicule immobilisé",
    companyId: fixture.companyId,
    actor,
  });

  const sms = await getDb()
    .prepare<{ body: string }>(
      `SELECT body FROM sms_outbox WHERE kind = 'RESERVATION_ANNULEE' ORDER BY created_at DESC LIMIT 1`,
    )
    .get();
  assert.ok(sms?.body.includes("Véhicule immobilisé"));
});

test("Phase 2 — mes réservations se retrouvent au numéro, quel que soit son format", async () => {
  const fixture = await seedFixture();
  const horaire = await publierHoraire(fixture, { bookingEnabled: true, onlineQuota: 6 });
  await createReservation({
    scheduleId: horaire.id,
    travelDate: demain(),
    passengerName: "Voyageur",
    passengerPhone: "0991111111",
    seats: 1,
  });

  const parFormatLocal = await passengerReservations("0991111111");
  const parFormatInternational = await passengerReservations("+243991111111");
  assert.equal(parFormatLocal.length, 1);
  assert.equal(parFormatInternational.length, 1);
  assert.equal(parFormatLocal[0].status, "CONFIRMEE");
  assert.equal(parFormatLocal[0].origin_city, "Kinshasa");
});

test("Phase 2 — une réservation dont le départ est passé bascule en voyage terminé", async () => {
  const fixture = await seedFixture();
  const horaire = await publierHoraire(fixture, { bookingEnabled: true, onlineQuota: 4 });
  const reservation = await createReservation({
    scheduleId: horaire.id,
    travelDate: demain(),
    passengerName: "Voyageur",
    passengerPhone: "0991111111",
    seats: 1,
  });

  // Le départ n'est pas réellement passé : on le déplace dans le passé pour
  // exercer le basculement, qui se fait à la lecture (§3.1, aucune tâche de fond).
  await getDb()
    .prepare(`UPDATE schedule_bookings SET departure_at = ? WHERE id = ?`)
    .run(new Date(Date.now() - 3_600_000).toISOString(), reservation.id);

  assert.equal(await settleFinishedReservations(), 1);
  const [apres] = await passengerReservations("0991111111");
  assert.equal(apres.status, "TERMINEE");
});

test("Phase 2 — la recherche annonce les places restantes, pas le quota brut", async () => {
  const fixture = await seedFixture();
  const horaire = await publierHoraire(fixture, {
    bookingEnabled: true,
    onlineQuota: 6,
    departureTime: "23:50",
  });
  const date = demain();
  await createReservation({
    scheduleId: horaire.id,
    travelDate: date,
    passengerName: "Voyageur",
    passengerPhone: "0991111111",
    seats: 2,
  });

  const offres = await searchOffers({ origin: "Kinshasa", destination: "Matadi", day: date });
  const offre = offres.find((row) => row.id === horaire.id);
  assert.ok(offre);
  assert.equal(offre!.bookingMode, "PLACES");
  assert.equal(offre!.placesOffertes, 6);
  assert.equal(offre!.placesDisponibles, 4);
});

// ---------------------------------------------------------------------------
// §29 — phases activées par agence
// ---------------------------------------------------------------------------

test("Modules — une agence sans dotation reçoit la phase 2 et rien d'autre", async () => {
  const fixture = await seedFixture();
  // La fixture insère la compagnie directement en base, sans passer par les
  // chemins applicatifs : `modules` y est NULL, comme pour toute compagnie
  // antérieure à la migration.
  await getDb().prepare(`UPDATE companies SET modules = NULL WHERE id = ?`).run(fixture.companyId);

  const acces = await companyAccess(fixture.companyId);
  assert.deepEqual(acces.modules, ["RESERVATION"]);
  assert.equal(hasModule(acces, "PAIEMENT"), false);
});

test("Modules — la vue simplifiée masque sans jamais fermer", async () => {
  const fixture = await seedFixture();
  await setCompanyModules({
    companyId: fixture.companyId,
    modules: ["RESERVATION", "PAIEMENT", "ERP"],
    actor: { userId: "usr_admin", role: "SUPER_ADMIN" },
  });
  await setAdvancedView({
    companyId: fixture.companyId,
    advancedView: false,
    actor: { userId: fixture.gerantId, role: "ADMIN_COMPAGNIE" },
  });

  const acces = await companyAccess(fixture.companyId);
  // Le module reste ouvert : les ventes en cours ne s'arrêtent pas.
  assert.equal(hasModule(acces, "PAIEMENT"), true);
  // Mais la navigation ne le montre plus.
  assert.equal(showsModule(acces, "PAIEMENT"), false);
  // La phase 2 est le socle : elle survit à la vue simplifiée.
  assert.equal(showsModule(acces, "RESERVATION"), true);
});

test("Modules — seule l'équipe Mobembo ouvre une phase", async () => {
  const fixture = await seedFixture();
  await assert.rejects(
    () =>
      setCompanyModules({
        companyId: fixture.companyId,
        modules: ["RESERVATION", "PAIEMENT", "ERP", "CONTROLE"],
        actor: { userId: fixture.gerantId, role: "ADMIN_COMPAGNIE" },
      }),
    (error: DomainError) => error.code === "INTERDIT",
  );
});

test("Modules — la vue du directeur ne peut pas élargir ce qui est ouvert", async () => {
  const fixture = await seedFixture();
  await setCompanyModules({
    companyId: fixture.companyId,
    modules: [],
    actor: { userId: "usr_admin", role: "SUPER_ADMIN" },
  });
  await setAdvancedView({
    companyId: fixture.companyId,
    advancedView: true,
    actor: { userId: fixture.gerantId, role: "ADMIN_COMPAGNIE" },
  });

  const acces = await companyAccess(fixture.companyId);
  assert.deepEqual(acces.modules, []);
  assert.deepEqual(acces.visible, []);
});

test("Modules — ouvrir un quota sans la phase 2 est refusé", async () => {
  const fixture = await seedFixture();
  await setCompanyModules({
    companyId: fixture.companyId,
    modules: [],
    actor: { userId: "usr_admin", role: "SUPER_ADMIN" },
  });

  await assert.rejects(
    () => publierHoraire(fixture, { bookingEnabled: true, onlineQuota: 5 }),
    (error: DomainError) => error.code === "INTERDIT",
  );

  // Publier un trajet reste possible : c'est la phase 1, elle n'est jamais fermée.
  const horaire = await publierHoraire(fixture);
  assert.equal(horaire.status, "PUBLIE");
});

test("Modules — fermer la phase 2 n'efface pas les réservations déjà prises", async () => {
  const fixture = await seedFixture();
  const horaire = await publierHoraire(fixture, { bookingEnabled: true, onlineQuota: 4 });
  await createReservation({
    scheduleId: horaire.id,
    travelDate: demain(),
    passengerName: "Voyageur",
    passengerPhone: "0991111111",
    seats: 1,
  });

  await setCompanyModules({
    companyId: fixture.companyId,
    modules: [],
    actor: { userId: "usr_admin", role: "SUPER_ADMIN" },
  });

  const reservations = await passengerReservations("0991111111");
  assert.equal(reservations.length, 1);
  assert.equal(reservations[0].status, "CONFIRMEE");
});

test("Modules — requireModule laisse passer une phase ouverte et bloque les autres", async () => {
  const fixture = await seedFixture();
  await setCompanyModules({
    companyId: fixture.companyId,
    modules: ["RESERVATION", "PAIEMENT"],
    actor: { userId: "usr_admin", role: "SUPER_ADMIN" },
  });

  const acces = await requireModule(fixture.companyId, "PAIEMENT");
  assert.equal(acces.companyId, fixture.companyId);

  await assert.rejects(
    () => requireModule(fixture.companyId, "ERP"),
    (error: DomainError) => error.code === "INTERDIT",
  );
});
