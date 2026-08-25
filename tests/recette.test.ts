/**
 * Cahier de tests — §5.2 « Modalités de recette ».
 *
 * « Chaque cas de test porte un résultat attendu explicite. Un test sans
 * résultat attendu écrit n'est pas un test. »
 *
 * Les huit scénarios critiques obligatoires du cahier des charges sont repris
 * un par un, dans l'ordre du document, suivis des règles commerciales qui
 * portent de l'argent.
 */
import test, { after } from "node:test";
import assert from "node:assert/strict";

import { getDb, closeDb } from "@/lib/db";

// Le pool mysql2 garde une connexion ouverte (contrairement à better-sqlite3) :
// sans fermeture explicite, le processus de test ne se termine jamais.
after(async () => {
  await closeDb();
});
import { DomainError } from "@/lib/core/errors";
import { toMinor } from "@/lib/core/money";
import { seedFixture, seatsOfChannel, actorGuichetier, type Fixture } from "./helpers";
import { lockSeats } from "@/lib/domain/seats";
import { holdSeats, createBooking, posSell } from "@/lib/domain/bookings";
import { initiatePayment, settlePayment, pollPayment } from "@/lib/domain/payments";
import { openCashSession, closeCashSession, cashSessionSummary } from "@/lib/domain/cash";
import { listForResale, completeResale } from "@/lib/domain/resale";
import { scanTicket, buildManifest } from "@/lib/domain/boarding";
import { getCompany } from "@/lib/domain/repo";
import { verifyQr } from "@/lib/domain/qr";

/** Vend un billet au guichet et renvoie le billet émis. */
async function sellAtCounter(
  fixture: Fixture,
  seat: string,
  opts?: { userId?: string; phone?: string; sessionId?: string; clientOpId?: string },
) {
  const cashSession =
    opts?.sessionId ??
    (
      await openCashSession({
        agencyId: fixture.agencyId,
        userId: opts?.userId ?? fixture.guichetierId,
        openingFloat: toMinor(50),
        currency: "USD",
        actorRole: "GUICHETIER",
      })
    ).id;

  return posSell({
    tripId: fixture.tripId,
    seatNumbers: [seat],
    passengers: [{ seatNumber: seat, name: "Passager Guichet" }],
    buyerPhone: opts?.phone ?? "+243811111111",
    buyerName: "Passager Guichet",
    cashSessionId: cashSession,
    currency: "USD",
    actor: actorGuichetier(fixture, opts?.userId),
    clientOpId: opts?.clientOpId,
  });
}

/** Achat en ligne complet : maintien, réservation, paiement confirmé. */
async function buyOnline(fixture: Fixture, seat: string, phone = "+243822222222") {
  const holdId = `hold_${seat}_${phone}`;
  await holdSeats({ tripId: fixture.tripId, seatNumbers: [seat], holdId });
  const { booking } = await createBooking({
    tripId: fixture.tripId,
    holdId,
    buyerPhone: phone,
    buyerName: "Passager En Ligne",
    passengers: [{ seatNumber: seat, name: "Passager En Ligne" }],
    currency: "USD",
  });
  const { payment } = await initiatePayment({
    bookingId: booking.id,
    provider: "MPESA",
    payerPhone: phone,
    idempotencyKey: `idem_${booking.id}`,
  });
  const settled = await settlePayment(payment.id, "CONFIRME");
  return { booking, payment: settled.payment, tickets: settled.tickets };
}

// ---------------------------------------------------------------------------
// §5.2 Scénario 1 — « Deux guichetiers sélectionnent le même siège au même
// instant : un seul billet émis. »
// ---------------------------------------------------------------------------
test("§5.2.1 — deux guichetiers sur le même siège : un seul billet émis", async () => {
  const fixture = await seedFixture();
  const [seat] = await seatsOfChannel(fixture.tripId, "GUICHET", 1);

  const first = await sellAtCounter(fixture, seat, { userId: fixture.guichetierId });
  assert.equal(first.tickets.length, 1, "le premier guichetier émet son billet");

  await assert.rejects(
    () => sellAtCounter(fixture, seat, { userId: fixture.guichetier2Id }),
    (error: unknown) =>
      error instanceof DomainError && error.code === "SIEGE_INDISPONIBLE",
    "le second guichetier est refusé sur le même siège",
  );

  const tickets = (await getDb()
    .prepare<{ n: number }>(
      `SELECT COUNT(*) AS n FROM tickets t JOIN trip_seats s ON s.id = t.trip_seat_id
        WHERE s.trip_id = ? AND s.seat_number = ? AND t.status = 'EMIS'`,
    )
    .get(fixture.tripId, seat)) as { n: number };
  assert.equal(tickets.n, 1, "exactement un billet valide sur ce siège");
});

test("§5.2.1 bis — verrouillage concurrent : un seul verrou obtenu", async () => {
  const fixture = await seedFixture();
  const [seat] = await seatsOfChannel(fixture.tripId, "EN_LIGNE", 1);

  await lockSeats({
    tripId: fixture.tripId,
    seatNumbers: [seat],
    channel: "EN_LIGNE",
    sessionId: "session-A",
    phone: "+243830000001",
  });
  await assert.rejects(
    () =>
      lockSeats({
        tripId: fixture.tripId,
        seatNumbers: [seat],
        channel: "EN_LIGNE",
        sessionId: "session-B",
        phone: "+243830000002",
      }),
    (error: unknown) => error instanceof DomainError && error.code === "SIEGE_INDISPONIBLE",
  );
});

// ---------------------------------------------------------------------------
// §5.2 Scénario 2 — « Coupure réseau en pleine vente guichet : la vente aboutit
// dans la limite du quota local, puis se synchronise sans doublon. »
// ---------------------------------------------------------------------------
test("§5.2.2 — vente hors-ligne rejouée deux fois : un seul billet", async () => {
  const fixture = await seedFixture();
  const [seat] = await seatsOfChannel(fixture.tripId, "GUICHET", 1);
  const clientOpId = "pos-device-1:op-42";

  const first = await sellAtCounter(fixture, seat, { clientOpId });
  // Le POS n'a pas reçu l'accusé et rejoue l'opération au retour du réseau.
  const replay = await posSell({
    tripId: fixture.tripId,
    seatNumbers: [seat],
    passengers: [{ seatNumber: seat, name: "Passager Guichet" }],
    buyerPhone: "+243811111111",
    buyerName: "Passager Guichet",
    cashSessionId: first.booking.cash_session_id!,
    currency: "USD",
    actor: actorGuichetier(fixture),
    clientOpId,
  });

  assert.equal(replay.booking.id, first.booking.id, "la réservation est la même");
  assert.equal(replay.tickets.length, 1);
  assert.equal(
    replay.tickets[0].ticket_code,
    first.tickets[0].ticket_code,
    "aucun second billet n'est créé",
  );
});

test("§5.2.2 bis — le quota guichet borne la vente hors-ligne", async () => {
  // Quota volontairement minuscule : le POS hors-ligne ne peut pas le dépasser,
  // c'est ce qui rend impossible le surbooking pendant une coupure (§2.3).
  const fixture = await seedFixture({ quotas: { GUICHET: 2, EN_LIGNE: 56, RESERVE_COMPAGNIE: 2 } });
  const seats = await seatsOfChannel(fixture.tripId, "GUICHET", 5);
  assert.equal(seats.length, 2, "le quota guichet ne contient que 2 sièges");

  const sessionId = (
    await openCashSession({
      agencyId: fixture.agencyId,
      userId: fixture.guichetierId,
      openingFloat: 0,
      currency: "USD",
      actorRole: "GUICHETIER",
    })
  ).id;
  await sellAtCounter(fixture, seats[0], { sessionId });
  await sellAtCounter(fixture, seats[1], { sessionId });

  const enLigne = (await seatsOfChannel(fixture.tripId, "EN_LIGNE", 1))[0];
  await assert.rejects(
    () => sellAtCounter(fixture, enLigne, { sessionId }),
    (error: unknown) => error instanceof DomainError && error.code === "SIEGE_AUTRE_CANAL",
    "le guichet ne peut pas piocher dans le quota en ligne",
  );
});

// ---------------------------------------------------------------------------
// §5.2 Scénario 3 — « Deux acheteurs en ligne sur le même siège remis en
// vente : un seul paiement accepté, l'autre verrou libéré. »
// ---------------------------------------------------------------------------
test("§5.2.3 — deux acheteurs sur un siège remis en vente : un seul aboutit", async () => {
  const fixture = await seedFixture();
  const [seat] = await seatsOfChannel(fixture.tripId, "EN_LIGNE", 1);
  const vente = await buyOnline(fixture, seat, "+243822222222");
  const ticket = vente.tickets[0];

  const listing = await listForResale({ ticketId: ticket.id, actorPhone: ticket.passenger_phone });

  // Deux acheteurs paient chacun leur réservation ; l'un seulement peut
  // récupérer le siège.
  const acheteurs = ["+243833333333", "+243844444444"];
  const bookings: string[] = [];
  for (const phone of acheteurs) {
    const holdId = `resale_${phone}`;
    // Le siège reste VENDU : l'acheteur ne verrouille pas le siège, il paie
    // l'annonce. La réservation porte un siège libre du quota en ligne comme
    // support comptable, puis la revente bascule le titulaire.
    const support = (await seatsOfChannel(fixture.tripId, "EN_LIGNE", 1))[0];
    await holdSeats({ tripId: fixture.tripId, seatNumbers: [support], holdId });
    const { booking } = await createBooking({
      tripId: fixture.tripId,
      holdId,
      buyerPhone: phone,
      buyerName: `Acheteur ${phone}`,
      passengers: [{ seatNumber: support, name: `Acheteur ${phone}` }],
      currency: "USD",
    });
    bookings.push(booking.id);
  }

  const premier = await completeResale({
    listingId: listing.id,
    buyerName: "Acheteur 1",
    buyerPhone: acheteurs[0],
    bookingId: bookings[0],
  });
  assert.equal(premier.nouveau.passenger_phone, acheteurs[0]);

  await assert.rejects(
    () =>
      completeResale({
        listingId: listing.id,
        buyerName: "Acheteur 2",
        buyerPhone: acheteurs[1],
        bookingId: bookings[1],
      }),
    (error: unknown) => error instanceof DomainError && error.code === "ANNONCE_INDISPONIBLE",
    "le second acheteur est refusé, l'annonce est déjà vendue",
  );
});

// ---------------------------------------------------------------------------
// §5.2 Scénario 4 — « Double clic sur le paiement : un seul débit, clé
// d'idempotence vérifiée. »
// ---------------------------------------------------------------------------
test("§5.2.4 — double clic sur le paiement : un seul débit", async () => {
  const fixture = await seedFixture();
  const [seat] = await seatsOfChannel(fixture.tripId, "EN_LIGNE", 1);
  const holdId = "hold-double-clic";
  await holdSeats({ tripId: fixture.tripId, seatNumbers: [seat], holdId });
  const { booking } = await createBooking({
    tripId: fixture.tripId,
    holdId,
    buyerPhone: "+243855555555",
    buyerName: "Double Clic",
    passengers: [{ seatNumber: seat, name: "Double Clic" }],
    currency: "USD",
  });

  const key = "idem-unique-123";
  const premier = await initiatePayment({
    bookingId: booking.id,
    provider: "MPESA",
    payerPhone: "+243855555555",
    idempotencyKey: key,
  });
  const second = await initiatePayment({
    bookingId: booking.id,
    provider: "MPESA",
    payerPhone: "+243855555555",
    idempotencyKey: key,
  });

  assert.equal(second.replayed, true, "la seconde initiation est reconnue comme rejeu");
  assert.equal(second.payment.id, premier.payment.id);

  const count = (await getDb()
    .prepare<{ n: number }>(`SELECT COUNT(*) AS n FROM payments WHERE booking_id = ?`)
    .get(booking.id)) as { n: number };
  assert.equal(count.n, 1, "un seul paiement en base");
});

// ---------------------------------------------------------------------------
// §5.2 Scénario 5 — « Webhook jamais reçu : bascule sur polling, puis statut
// indéterminé et ticket support créé. »
// ---------------------------------------------------------------------------
test("§5.2.5 — webhook jamais reçu : INDETERMINE, siège verrouillé, ticket support", async () => {
  const fixture = await seedFixture();
  const [seat] = await seatsOfChannel(fixture.tripId, "EN_LIGNE", 1);
  const holdId = "hold-sans-webhook";
  // Le numéro se terminant par 9999 simule un opérateur qui ne répond jamais.
  const phone = "+243866669999";

  await holdSeats({ tripId: fixture.tripId, seatNumbers: [seat], holdId });
  const { booking } = await createBooking({
    tripId: fixture.tripId,
    holdId,
    buyerPhone: phone,
    buyerName: "Sans Webhook",
    passengers: [{ seatNumber: seat, name: "Sans Webhook" }],
    currency: "USD",
  });
  const { payment } = await initiatePayment({
    bookingId: booking.id,
    provider: "AIRTEL_MONEY",
    payerPhone: phone,
    idempotencyKey: "idem-sans-webhook",
  });
  assert.equal(payment.status, "INITIE");

  // Le polling n'obtient rien pendant la fenêtre de 5 minutes.
  let polled = await pollPayment(payment.id);
  assert.equal(polled.status, "INITIE", "avant 5 min, on continue d'interroger");

  // On force l'écoulement de la fenêtre plutôt que d'attendre réellement.
  await getDb()
    .prepare(`UPDATE payments SET created_at = ? WHERE id = ?`)
    .run(new Date(Date.now() - 6 * 60_000).toISOString(), payment.id);
  polled = await pollPayment(payment.id);

  assert.equal(polled.status, "INDETERMINE", "le système ne devine jamais");

  const seatRow = (await getDb()
    .prepare<{ status: string }>(`SELECT status FROM trip_seats WHERE trip_id = ? AND seat_number = ?`)
    .get(fixture.tripId, seat)) as { status: string };
  assert.equal(seatRow.status, "VERROUILLE", "le siège reste verrouillé");

  const support = (await getDb()
    .prepare<{ n: number }>(`SELECT COUNT(*) AS n FROM support_tickets WHERE reference = ?`)
    .get(payment.id)) as { n: number };
  assert.equal(support.n, 1, "un ticket support est ouvert pour arbitrage humain");
});

// ---------------------------------------------------------------------------
// §5.2 Scénario 6 — « Ancien QR d'un billet revendu présenté à
// l'embarquement : refus explicite, avec le nom du nouveau titulaire. »
// ---------------------------------------------------------------------------
test("§5.2.6 — ancien QR après revente : refus avec le nouveau titulaire", async () => {
  const fixture = await seedFixture();
  const [seat] = await seatsOfChannel(fixture.tripId, "EN_LIGNE", 1);
  const vente = await buyOnline(fixture, seat, "+243877777777");
  const ancien = vente.tickets[0];
  const ancienQr = ancien.qr_signature;

  const listing = await listForResale({ ticketId: ancien.id, actorPhone: ancien.passenger_phone });
  const support = (await seatsOfChannel(fixture.tripId, "EN_LIGNE", 1))[0];
  await holdSeats({ tripId: fixture.tripId, seatNumbers: [support], holdId: "h-rachat" });
  const { booking } = await createBooking({
    tripId: fixture.tripId,
    holdId: "h-rachat",
    buyerPhone: "+243888888888",
    buyerName: "Nouveau Titulaire",
    passengers: [{ seatNumber: support, name: "Nouveau Titulaire" }],
    currency: "USD",
  });
  await completeResale({
    listingId: listing.id,
    buyerName: "Nouveau Titulaire",
    buyerPhone: "+243888888888",
    bookingId: booking.id,
  });

  const outcome = await scanTicket({ tripId: fixture.tripId, rawQr: ancienQr });
  assert.equal(outcome.result, "REFUSE");
  assert.match(outcome.result === "REFUSE" ? outcome.motif : "", /revendu/i);
  assert.match(
    outcome.result === "REFUSE" ? (outcome.nouveauTitulaire ?? "") : "",
    /Nouveau Titulaire/,
    "le contrôleur voit à qui appartient désormais le siège",
  );

  // Le manifeste porte le même verdict, hors-ligne.
  const manifest = await buildManifest(fixture.tripId);
  const entry = manifest.entries.find((e) => e.ticketCode === ancien.ticket_code);
  assert.ok(entry?.invalide);
  assert.equal(entry?.motifInvalidite, "Billet revendu — QR invalidé");
});

// ---------------------------------------------------------------------------
// §5.2 Scénario 7 — « Même QR scanné deux fois : avertissement "déjà scanné"
// avec l'heure du premier scan. »
// ---------------------------------------------------------------------------
test("§5.2.7 — même QR scanné deux fois : avertissement daté", async () => {
  const fixture = await seedFixture();
  const [seat] = await seatsOfChannel(fixture.tripId, "GUICHET", 1);
  const vente = await sellAtCounter(fixture, seat);
  const qr = vente.tickets[0].qr_signature;

  const premier = await scanTicket({ tripId: fixture.tripId, rawQr: qr, deviceId: "terminal-1" });
  assert.equal(premier.result, "ACCEPTE");

  const second = await scanTicket({ tripId: fixture.tripId, rawQr: qr, deviceId: "terminal-1" });
  assert.equal(second.result, "DEJA_SCANNE");
  assert.ok(
    second.result === "DEJA_SCANNE" && second.premierScanA,
    "l'heure du premier scan est restituée",
  );
});

test("§2.7 — le QR se vérifie hors-ligne, sans accès à la base", async () => {
  const fixture = await seedFixture();
  const [seat] = await seatsOfChannel(fixture.tripId, "GUICHET", 1);
  const ticket = (await sellAtCounter(fixture, seat)).tickets[0];
  const company = await getCompany(fixture.companyId);

  const ok = verifyQr(ticket.qr_signature, [company.qr_secret]);
  assert.equal(ok.valid, true, "la clé de la compagnie suffit à valider");

  const falsifie = ticket.qr_signature.replace(/\|[^|]+$/, "|SIGNATUREBIDONABCDEFGH");
  assert.equal(verifyQr(falsifie, [company.qr_secret]).valid, false);
  assert.equal(
    verifyQr(ticket.qr_signature, ["cle-d-une-autre-compagnie"]).valid,
    false,
    "la clé d'une autre compagnie ne valide pas",
  );
});

// ---------------------------------------------------------------------------
// §5.2 Scénario 8 — « Fermeture de caisse avec écart : calcul correct, session
// non modifiable après clôture. »
// ---------------------------------------------------------------------------
test("§5.2.8 — fermeture de caisse : écart exact, clôture non rejouable", async () => {
  const fixture = await seedFixture();
  const seats = await seatsOfChannel(fixture.tripId, "GUICHET", 3);

  const session = await openCashSession({
    agencyId: fixture.agencyId,
    userId: fixture.guichetierId,
    openingFloat: toMinor(50),
    currency: "USD",
    actorRole: "GUICHETIER",
  });
  for (const seat of seats) await sellAtCounter(fixture, seat, { sessionId: session.id });

  const avant = await cashSessionSummary(session.id);
  // 50 $ de fond + 3 billets à 15 $ = 95 $ attendus.
  assert.equal(avant.attendu, toMinor(95));

  // L'agent compte 85 $ : il manque 10 $, au-delà du seuil d'alerte de 5 $.
  const fermeture = await closeCashSession({
    sessionId: session.id,
    countedAmount: toMinor(85),
    actor: { userId: fixture.guichetierId, role: "GUICHETIER" },
  });
  assert.equal(fermeture.variance, toMinor(-10), "écart = compté − attendu");

  await assert.rejects(
    () =>
      closeCashSession({
        sessionId: session.id,
        countedAmount: toMinor(95),
        actor: { userId: fixture.guichetierId, role: "GUICHETIER" },
      }),
    (error: unknown) => error instanceof DomainError && error.code === "CAISSE_DEJA_FERMEE",
    "une session ne se ferme pas deux fois",
  );

  const dernierGuichet = (await seatsOfChannel(fixture.tripId, "GUICHET", 1))[0];
  await assert.rejects(
    () =>
      posSell({
        tripId: fixture.tripId,
        seatNumbers: [dernierGuichet],
        passengers: [{ seatNumber: dernierGuichet, name: "Tardif" }],
        buyerPhone: "+243899999999",
        buyerName: "Tardif",
        cashSessionId: session.id,
        currency: "USD",
        actor: actorGuichetier(fixture),
      }),
    (error: unknown) => error instanceof DomainError && error.code === "CAISSE_FERMEE",
    "aucune vente après clôture",
  );

  const alerte = (await getDb()
    .prepare<{ n: number }>(`SELECT COUNT(*) AS n FROM alerts WHERE kind = 'ECART_CAISSE'`)
    .get()) as { n: number };
  assert.equal(alerte.n, 1, "l'écart au-delà du seuil remonte au gérant (§2.11)");
});
