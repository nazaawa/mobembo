import test, { after } from "node:test";
import assert from "node:assert/strict";
import { closeDb, getDb } from "@/lib/db";
import { toMinor } from "@/lib/core/money";
import { addDays, todayInKinshasa } from "@/lib/core/time";
import { DomainError } from "@/lib/core/errors";
import { createSchedule } from "@/lib/domain/schedules";
import { cancelReservation, createReservation } from "@/lib/domain/reservations";
import { setCompanyModules } from "@/lib/domain/access";
import {
  digitalTicket,
  expirePastTickets,
  initiateReservationPayment,
  markRefunded,
  passengerTickets,
  paymentQuote,
  settleReservationPayment,
  ticketOfReservation,
  ticketingSummary,
} from "@/lib/domain/reservation-payments";
import { verifyReservationQr, verifyQr, qrKind } from "@/lib/domain/qr";
import { settleByReference } from "@/lib/domain/webhook-settlement";
import { seedFixture } from "./helpers";

after(async () => closeDb());

const MOBEMBO = { userId: "usr_admin", role: "SUPER_ADMIN" };

function demain(): string {
  return addDays(todayInKinshasa(), 1);
}

/** Agence de phase 3 : référencée, réservation ouverte, paiement ouvert. */
async function agencePhase3(options?: { modules?: Parameters<typeof setCompanyModules>[0]["modules"] }) {
  const fixture = await seedFixture();
  await setCompanyModules({
    companyId: fixture.companyId,
    modules: options?.modules ?? ["RESERVATION", "PAIEMENT"],
    actor: MOBEMBO,
  });
  const horaire = await createSchedule({
    companyId: fixture.companyId,
    agencyId: fixture.agencyId,
    originCity: "Kinshasa",
    destinationCity: "Matadi",
    departureTime: "06:30",
    days: [1, 2, 3, 4, 5, 6, 7],
    priceUsd: toMinor(25),
    boardingPoint: "Rond-point Ngaba",
    bookingEnabled: true,
    onlineQuota: 8,
    actor: { userId: fixture.gerantId, role: "GERANT_AGENCE" },
  });
  const reservation = await createReservation({
    scheduleId: horaire.id,
    travelDate: demain(),
    passengerName: "Grâce Mbuyi",
    passengerPhone: "0991111111",
    seats: 2,
  });
  return { fixture, horaire, reservation };
}

// ---------------------------------------------------------------------------
// §14.1 — le devis avant le débit
// ---------------------------------------------------------------------------

test("Phase 3 — le devis détaille prix, places, total et frais", async () => {
  const { reservation } = await agencePhase3();
  const devis = await paymentQuote(reservation.id);

  assert.equal(devis.prixUnitaire, toMinor(25));
  assert.equal(devis.places, 2);
  assert.equal(devis.sousTotal, toMinor(50));
  // §17 : la commission est prise sur le reversement, pas ajoutée au voyageur.
  assert.equal(devis.frais, 0);
  assert.equal(devis.total, toMinor(50));
  assert.equal(devis.commission, toMinor(5));
  assert.equal(devis.payable, true);
});

test("Phase 3 — sans le module, le devis explique et refuse le paiement", async () => {
  const { reservation } = await agencePhase3({ modules: ["RESERVATION"] });
  const devis = await paymentQuote(reservation.id);

  assert.equal(devis.payable, false);
  assert.match(devis.motifNonPayable!, /pas encore le paiement en ligne/);

  await assert.rejects(
    () =>
      initiateReservationPayment({
        reservationId: reservation.id,
        provider: "MPESA",
        payerPhone: "0991111111",
        idempotencyKey: "cle-1",
      }),
    (error: DomainError) => error.code === "PAIEMENT_IMPOSSIBLE",
  );
});

// ---------------------------------------------------------------------------
// §16 — un billet n'existe qu'après confirmation du paiement
// ---------------------------------------------------------------------------

test("Phase 3 — aucun billet tant que le paiement n'est pas confirmé", async () => {
  const { reservation } = await agencePhase3();
  const { payment } = await initiateReservationPayment({
    reservationId: reservation.id,
    provider: "MPESA",
    payerPhone: "0991111111",
    idempotencyKey: "cle-attente",
  });

  assert.equal(payment.status, "INITIE");
  assert.equal(await ticketOfReservation(reservation.id), null);

  const apres = await getDb()
    .prepare<{ payment_status: string }>(
      `SELECT payment_status FROM schedule_bookings WHERE id = ?`,
    )
    .get(reservation.id);
  assert.equal(apres?.payment_status, "EN_ATTENTE");
});

test("Phase 3 — un paiement échoué ne génère aucun billet et rend la réservation payable sur place", async () => {
  const { reservation } = await agencePhase3();
  const { payment } = await initiateReservationPayment({
    reservationId: reservation.id,
    provider: "MPESA",
    payerPhone: "0991111111",
    idempotencyKey: "cle-echec",
  });
  await settleReservationPayment(payment.id, "ECHOUE");

  assert.equal(await ticketOfReservation(reservation.id), null);
  const apres = await getDb()
    .prepare<{ status: string; payment_status: string }>(
      `SELECT status, payment_status FROM schedule_bookings WHERE id = ?`,
    )
    .get(reservation.id);
  // La place reste tenue : l'échec du paiement ne coûte pas la réservation.
  assert.equal(apres?.status, "CONFIRMEE");
  assert.equal(apres?.payment_status, "SUR_PLACE");
});

test("Phase 3 — le paiement confirmé émet le billet numérique et le SMS", async () => {
  const { reservation } = await agencePhase3();
  const { payment } = await initiateReservationPayment({
    reservationId: reservation.id,
    provider: "MPESA",
    payerPhone: "0991111111",
    idempotencyKey: "cle-ok",
  });
  const { ticket } = await settleReservationPayment(payment.id, "CONFIRME");

  assert.ok(ticket);
  assert.equal(ticket!.status, "VALIDE");
  assert.equal(ticket!.seats, 2);
  assert.equal(ticket!.paid_amount, toMinor(50));
  assert.match(ticket!.ticket_code, /^[A-Z0-9]{4}-[A-Z0-9]{4}$/);

  const apres = await getDb()
    .prepare<{ payment_status: string }>(
      `SELECT payment_status FROM schedule_bookings WHERE id = ?`,
    )
    .get(reservation.id);
  assert.equal(apres?.payment_status, "PAYEE");

  const sms = await getDb()
    .prepare<{ body: string }>(
      `SELECT body FROM sms_outbox WHERE kind = 'BILLET_EMIS' ORDER BY created_at DESC LIMIT 1`,
    )
    .get();
  assert.ok(sms?.body.includes(ticket!.ticket_code));
});

test("Phase 3 — un webhook rejoué n'émet pas un second billet", async () => {
  const { reservation } = await agencePhase3();
  const { payment } = await initiateReservationPayment({
    reservationId: reservation.id,
    provider: "MPESA",
    payerPhone: "0991111111",
    idempotencyKey: "cle-rejeu",
  });

  const premier = await settleReservationPayment(payment.id, "CONFIRME");
  const second = await settleReservationPayment(payment.id, "CONFIRME");

  assert.equal(premier.ticket!.id, second.ticket!.id);
  const nombre = await getDb()
    .prepare<{ n: number }>(
      `SELECT COUNT(*) AS n FROM schedule_tickets WHERE reservation_id = ?`,
    )
    .get(reservation.id);
  assert.equal(nombre?.n, 1);
});

test("Phase 3 — la clé d'idempotence empêche un second débit", async () => {
  const { reservation } = await agencePhase3();
  const premier = await initiateReservationPayment({
    reservationId: reservation.id,
    provider: "MPESA",
    payerPhone: "0991111111",
    idempotencyKey: "cle-unique",
  });
  const second = await initiateReservationPayment({
    reservationId: reservation.id,
    provider: "MPESA",
    payerPhone: "0991111111",
    idempotencyKey: "cle-unique",
  });

  assert.equal(second.replayed, true);
  assert.equal(second.payment.id, premier.payment.id);
  const nombre = await getDb()
    .prepare<{ n: number }>(
      `SELECT COUNT(*) AS n FROM schedule_payments WHERE reservation_id = ?`,
    )
    .get(reservation.id);
  assert.equal(nombre?.n, 1);
});

test("Phase 3 — le webhook trouve un paiement de réservation par sa référence", async () => {
  const { reservation } = await agencePhase3();
  const { payment } = await initiateReservationPayment({
    reservationId: reservation.id,
    provider: "MPESA",
    payerPhone: "0991111111",
    idempotencyKey: "cle-webhook",
  });

  const resultat = await settleByReference("cle-webhook", "CONFIRME", { source: "test" });
  assert.equal(resultat.trouve, true);
  assert.equal(resultat.billetsEmis, 1);
  assert.ok(await ticketOfReservation(payment.reservation_id));
});

// ---------------------------------------------------------------------------
// §14.3 / §16 — le billet et son QR
// ---------------------------------------------------------------------------

test("Phase 3 — le QR du billet est signé par la clé de l'agence et n'est pas un QR de siège", async () => {
  const { fixture, reservation } = await agencePhase3();
  const { payment } = await initiateReservationPayment({
    reservationId: reservation.id,
    provider: "MPESA",
    payerPhone: "0991111111",
    idempotencyKey: "cle-qr",
  });
  const { ticket } = await settleReservationPayment(payment.id, "CONFIRME");

  const secret = await getDb()
    .prepare<{ qr_secret: string }>(`SELECT qr_secret FROM companies WHERE id = ?`)
    .get(fixture.companyId);

  assert.equal(qrKind(ticket!.qr_signature), "RESERVATION");
  const verif = verifyReservationQr(ticket!.qr_signature, [secret!.qr_secret]);
  assert.equal(verif.valid, true);
  if (verif.valid) assert.equal(verif.payload.ticketId, ticket!.id);

  // Le vérificateur de billets à sièges doit le refuser sur le format, pas le
  // confondre avec un billet de phase 4.
  const autre = verifyQr(ticket!.qr_signature, [secret!.qr_secret]);
  assert.equal(autre.valid, false);
  if (!autre.valid) assert.equal(autre.reason, "FORMAT");
});

test("Phase 3 — la clé d'une autre agence ne valide pas le QR", async () => {
  const { reservation } = await agencePhase3();
  const { payment } = await initiateReservationPayment({
    reservationId: reservation.id,
    provider: "MPESA",
    payerPhone: "0991111111",
    idempotencyKey: "cle-qr-2",
  });
  const { ticket } = await settleReservationPayment(payment.id, "CONFIRME");

  const verif = verifyReservationQr(ticket!.qr_signature, ["secret-d-une-autre-agence"]);
  assert.equal(verif.valid, false);
  if (!verif.valid) assert.equal(verif.reason, "SIGNATURE");
});

test("Phase 3 — le billet numérique porte tout ce que §14.3 demande", async () => {
  const { reservation } = await agencePhase3();
  const { payment } = await initiateReservationPayment({
    reservationId: reservation.id,
    provider: "MPESA",
    payerPhone: "0991111111",
    idempotencyKey: "cle-contenu",
  });
  const { ticket } = await settleReservationPayment(payment.id, "CONFIRME");

  const billet = await digitalTicket(ticket!.id);
  assert.ok(billet);
  assert.equal(billet!.reservation.passenger_name, "Grâce Mbuyi");
  assert.equal(billet!.reservation.compagnie, "Compagnie Test");
  assert.equal(billet!.reservation.origin_city, "Kinshasa");
  assert.equal(billet!.reservation.destination_city, "Matadi");
  assert.equal(billet!.reservation.travel_date, demain());
  assert.equal(billet!.reservation.departure_time, "06:30");
  assert.equal(billet!.reservation.boarding_point, "Rond-point Ngaba");
  assert.ok(billet!.ticket_code);
  assert.ok(billet!.qr_signature);
  assert.equal(billet!.status, "VALIDE");
});

test("Phase 3 — un billet se retrouve aussi par son code dicté au téléphone", async () => {
  const { reservation } = await agencePhase3();
  const { payment } = await initiateReservationPayment({
    reservationId: reservation.id,
    provider: "MPESA",
    payerPhone: "0991111111",
    idempotencyKey: "cle-code",
  });
  const { ticket } = await settleReservationPayment(payment.id, "CONFIRME");

  const parCode = await digitalTicket(ticket!.ticket_code);
  assert.equal(parCode?.id, ticket!.id);
});

// ---------------------------------------------------------------------------
// §14.4 — mes billets
// ---------------------------------------------------------------------------

test("Phase 3 — un billet dont le départ est passé devient expiré", async () => {
  const { reservation } = await agencePhase3();
  const { payment } = await initiateReservationPayment({
    reservationId: reservation.id,
    provider: "MPESA",
    payerPhone: "0991111111",
    idempotencyKey: "cle-expire",
  });
  await settleReservationPayment(payment.id, "CONFIRME");

  await getDb()
    .prepare(`UPDATE schedule_bookings SET departure_at = ? WHERE id = ?`)
    .run(new Date(Date.now() - 3_600_000).toISOString(), reservation.id);

  assert.equal(await expirePastTickets(), 1);
  const [billet] = await passengerTickets("+243991111111");
  assert.equal(billet.status, "EXPIRE");
});

test("Phase 3 — mes billets se retrouvent au numéro du voyageur", async () => {
  const { reservation } = await agencePhase3();
  const { payment } = await initiateReservationPayment({
    reservationId: reservation.id,
    provider: "MPESA",
    payerPhone: "0991111111",
    idempotencyKey: "cle-liste",
  });
  await settleReservationPayment(payment.id, "CONFIRME");

  const miens = await passengerTickets("+243991111111");
  assert.equal(miens.length, 1);
  const autres = await passengerTickets("+243992222222");
  assert.equal(autres.length, 0);
});

// ---------------------------------------------------------------------------
// §16 — annulation et remboursement
// ---------------------------------------------------------------------------

test("Phase 3 — annuler un billet payé l'invalide et met le paiement à rembourser", async () => {
  const { fixture, reservation } = await agencePhase3();
  const { payment } = await initiateReservationPayment({
    reservationId: reservation.id,
    provider: "MPESA",
    payerPhone: "0991111111",
    idempotencyKey: "cle-annul",
  });
  await settleReservationPayment(payment.id, "CONFIRME");

  await cancelReservation({
    reservationId: reservation.id,
    by: "AGENCE",
    reason: "Véhicule immobilisé",
    companyId: fixture.companyId,
    actor: { userId: fixture.gerantId, role: "ADMIN_COMPAGNIE" },
  });

  const billet = await ticketOfReservation(reservation.id);
  // §16 : un billet annulé ne doit plus passer au contrôle.
  assert.equal(billet?.status, "ANNULE");

  const apres = await getDb()
    .prepare<{ status: string }>(`SELECT status FROM schedule_payments WHERE id = ?`)
    .get(payment.id);
  assert.equal(apres?.status, "A_REMBOURSER");

  const resume = await ticketingSummary(fixture.companyId);
  assert.equal(resume.remboursementsATraiter, 1);
  assert.equal(resume.billetsAnnules, 1);
});

test("Phase 3 — l'agence déclare le remboursement effectué, une seule fois", async () => {
  const { fixture, reservation } = await agencePhase3();
  const { payment } = await initiateReservationPayment({
    reservationId: reservation.id,
    provider: "MPESA",
    payerPhone: "0991111111",
    idempotencyKey: "cle-remb",
  });
  await settleReservationPayment(payment.id, "CONFIRME");
  await cancelReservation({
    reservationId: reservation.id,
    by: "VOYAGEUR",
    phone: "0991111111",
  });

  const rembourse = await markRefunded({
    paymentId: payment.id,
    companyId: fixture.companyId,
    actor: { userId: fixture.gerantId, role: "ADMIN_COMPAGNIE" },
  });
  assert.equal(rembourse.status, "REMBOURSE");

  await assert.rejects(
    () =>
      markRefunded({
        paymentId: payment.id,
        companyId: fixture.companyId,
        actor: { userId: fixture.gerantId, role: "ADMIN_COMPAGNIE" },
      }),
    (error: DomainError) => error.code === "RIEN_A_REMBOURSER",
  );
});

test("Phase 3 — une autre agence ne déclare pas un remboursement qui ne la concerne pas", async () => {
  const { fixture, reservation } = await agencePhase3();
  const { payment } = await initiateReservationPayment({
    reservationId: reservation.id,
    provider: "MPESA",
    payerPhone: "0991111111",
    idempotencyKey: "cle-remb-2",
  });
  await settleReservationPayment(payment.id, "CONFIRME");
  await cancelReservation({ reservationId: reservation.id, by: "VOYAGEUR", phone: "0991111111" });

  await assert.rejects(
    () =>
      markRefunded({
        paymentId: payment.id,
        companyId: "cmp_intrus",
        actor: { userId: fixture.gerantId, role: "ADMIN_COMPAGNIE" },
      }),
    (error: DomainError) => error.code === "INTERDIT",
  );
});

// ---------------------------------------------------------------------------
// §15 / §17 — ce que l'agence voit, et ce que Mobembo retient
// ---------------------------------------------------------------------------

test("Phase 3 — le résumé agence compte billets, places et encaissements", async () => {
  const { fixture, reservation } = await agencePhase3();
  const { payment } = await initiateReservationPayment({
    reservationId: reservation.id,
    provider: "MPESA",
    payerPhone: "0991111111",
    idempotencyKey: "cle-resume",
  });
  await settleReservationPayment(payment.id, "CONFIRME");

  const resume = await ticketingSummary(fixture.companyId);
  assert.equal(resume.billetsVendus, 1);
  assert.equal(resume.placesVendues, 2);
  assert.equal(resume.encaisseUsd, toMinor(50));
  // §17 : 10 % de 50 USD.
  assert.equal(resume.commissionUsd, toMinor(5));
  assert.equal(resume.remboursementsATraiter, 0);
});

test("Phase 3 — la commission de 10 % est figée à la confirmation du paiement", async () => {
  const { fixture, reservation } = await agencePhase3();
  const { payment } = await initiateReservationPayment({
    reservationId: reservation.id,
    provider: "MPESA",
    payerPhone: "0991111111",
    idempotencyKey: "cle-commission",
  });
  await settleReservationPayment(payment.id, "CONFIRME");

  // Le taux change après coup : le paiement déjà encaissé ne bouge pas.
  await getDb()
    .prepare(`UPDATE companies SET online_commission_rate = 0.2 WHERE id = ?`)
    .run(fixture.companyId);

  const ligne = await getDb()
    .prepare<{ commission_amount: number }>(
      `SELECT commission_amount FROM schedule_payments WHERE id = ?`,
    )
    .get(payment.id);
  assert.equal(ligne?.commission_amount, toMinor(5));
});

test("Phase 3 — le module fermé après coup n'efface pas les billets déjà émis", async () => {
  const { fixture, reservation } = await agencePhase3();
  const { payment } = await initiateReservationPayment({
    reservationId: reservation.id,
    provider: "MPESA",
    payerPhone: "0991111111",
    idempotencyKey: "cle-fermeture",
  });
  await settleReservationPayment(payment.id, "CONFIRME");

  await setCompanyModules({
    companyId: fixture.companyId,
    modules: ["RESERVATION"],
    actor: MOBEMBO,
  });

  const billets = await passengerTickets("+243991111111");
  assert.equal(billets.length, 1);
  assert.equal(billets[0].status, "VALIDE");
});
