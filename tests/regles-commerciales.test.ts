/**
 * §2.6, §2.9, §2.10 — les règles qui portent de l'argent.
 *
 * « Ces règles ne sont pas de la documentation contractuelle : elles se
 * traduisent en code dans le back-office et le moteur de reversement. » (§2.10)
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
import { holdSeats, createBooking, posSell } from "@/lib/domain/bookings";
import { initiatePayment, settlePayment } from "@/lib/domain/payments";
import { openCashSession } from "@/lib/domain/cash";
import {
  listForResale,
  completeResale,
  transferTicket,
  checkResaleEligibility,
  resaleFee,
  expireStaleListings,
  withdrawResale,
} from "@/lib/domain/resale";
import { renunciationGrid, renounceForCredit, applyLiability, activeCredits } from "@/lib/domain/cancellation";
import { computeSettlement } from "@/lib/domain/settlements";
import { rebalanceChannel, seatAvailability, releaseExpiredLocks } from "@/lib/domain/seats";
import { detectSequenceGaps, cancelTicketByManager } from "@/lib/domain/tickets";
import { markDeparted, closeManifest, scanTicket } from "@/lib/domain/boarding";
import { searchTrips } from "@/lib/domain/planning";
import { getTicket } from "@/lib/domain/repo";
import { DEFAULT_POLICY } from "@/lib/domain/types";

async function buyOnline(
  fixture: Fixture,
  seat: string,
  phone: string,
  holdId = `hold-${seat}-${phone}`,
) {
  await holdSeats({ tripId: fixture.tripId, seatNumbers: [seat], holdId });
  const { booking } = await createBooking({
    tripId: fixture.tripId,
    holdId,
    buyerPhone: phone,
    buyerName: "Acheteur",
    passengers: [{ seatNumber: seat, name: "Acheteur" }],
    currency: "USD",
  });
  const { payment } = await initiatePayment({
    bookingId: booking.id,
    provider: "MPESA",
    payerPhone: phone,
    idempotencyKey: `idem-${booking.id}`,
  });
  const settled = await settlePayment(payment.id, "CONFIRME");
  return { booking, tickets: settled.tickets };
}

// --- §2.6 Revente ----------------------------------------------------------

test("§2.6 — commission de 10 % avec plancher de 1 USD", () => {
  // Billet à 15 $ : 10 % = 1,50 $, au-dessus du plancher.
  assert.equal(resaleFee(toMinor(15), "USD", DEFAULT_POLICY, 2850), toMinor(1.5));
  // Billet à 5 $ : 10 % = 0,50 $, le plancher de 1 $ s'applique — sinon la
  // commission ne couvre pas les frais opérateur (encaissement + décaissement).
  assert.equal(resaleFee(toMinor(5), "USD", DEFAULT_POLICY, 2850), toMinor(1));
  // Le plancher se convertit dans la devise du billet.
  assert.equal(resaleFee(toMinor(10000), "CDF", DEFAULT_POLICY, 2850), toMinor(2850));
});

test("§2.6 — le siège reste VENDU pendant la revente : jamais de double vente", async () => {
  const fixture = await seedFixture();
  const [seat] = await seatsOfChannel(fixture.tripId, "EN_LIGNE", 1);
  const { tickets } = await buyOnline(fixture, seat, "+243870000001");

  await listForResale({ ticketId: tickets[0].id, actorPhone: "+243870000001" });

  const seatRow = (await getDb()
    .prepare<{ status: string }>(`SELECT status FROM trip_seats WHERE id = ?`)
    .get(tickets[0].trip_seat_id)) as { status: string };
  assert.equal(seatRow.status, "VENDU", "le siège ne retourne jamais au stock disponible");
});

test("§2.6 — le prix de revente est celui de l'achat, non négociable", async () => {
  const fixture = await seedFixture();
  const [seat] = await seatsOfChannel(fixture.tripId, "EN_LIGNE", 1);
  const { tickets } = await buyOnline(fixture, seat, "+243870000002");
  const listing = await listForResale({ ticketId: tickets[0].id, actorPhone: "+243870000002" });
  assert.equal(listing.price_amount, fixture.priceUsd, "aucune fixation libre du prix");
});

test("§2.6 — un billet ne se revend qu'une seule fois", async () => {
  const fixture = await seedFixture();
  const [seat] = await seatsOfChannel(fixture.tripId, "EN_LIGNE", 1);
  const { tickets } = await buyOnline(fixture, seat, "+243870000003");
  const listing = await listForResale({ ticketId: tickets[0].id, actorPhone: "+243870000003" });

  const support = (await seatsOfChannel(fixture.tripId, "EN_LIGNE", 1))[0];
  await holdSeats({ tripId: fixture.tripId, seatNumbers: [support], holdId: "h1" });
  const { booking } = await createBooking({
    tripId: fixture.tripId,
    holdId: "h1",
    buyerPhone: "+243870000004",
    buyerName: "Repreneur",
    passengers: [{ seatNumber: support, name: "Repreneur" }],
    currency: "USD",
  });
  const { nouveau } = await completeResale({
    listingId: listing.id,
    buyerName: "Repreneur",
    buyerPhone: "+243870000004",
    bookingId: booking.id,
  });

  const ancien = await getTicket(tickets[0].id);
  assert.equal(ancien.status, "ANNULE_REVENDU");
  assert.equal(ancien.resold_count, 1);
  // Le nouveau billet est neuf : il peut lui-même être revendu une fois.
  assert.equal(nouveau.resold_count, 0);
  assert.equal((await checkResaleEligibility(nouveau.id)).eligible, true);
});

test("§2.6 — remboursement dirigé vers le numéro du paiement initial", async () => {
  const fixture = await seedFixture();
  const [seat] = await seatsOfChannel(fixture.tripId, "EN_LIGNE", 1);
  const payeur = "+243871111111";
  const { tickets } = await buyOnline(fixture, seat, payeur);
  const listing = await listForResale({ ticketId: tickets[0].id, actorPhone: payeur });

  const support = (await seatsOfChannel(fixture.tripId, "EN_LIGNE", 1))[0];
  await holdSeats({ tripId: fixture.tripId, seatNumbers: [support], holdId: "h2" });
  const { booking } = await createBooking({
    tripId: fixture.tripId,
    holdId: "h2",
    buyerPhone: "+243872222222",
    buyerName: "Repreneur",
    passengers: [{ seatNumber: support, name: "Repreneur" }],
    currency: "USD",
  });
  await completeResale({
    listingId: listing.id,
    buyerName: "Repreneur",
    buyerPhone: "+243872222222",
    bookingId: booking.id,
  });

  const refund = (await getDb()
    .prepare<{ target_phone: string; amount: number }>(
      `SELECT target_phone, amount FROM refunds WHERE ticket_id = ?`,
    )
    .get(tickets[0].id)) as { target_phone: string; amount: number };
  assert.equal(refund.target_phone, payeur, "jamais un numéro saisi au moment de la revente");
  assert.equal(refund.amount, fixture.priceUsd - toMinor(1.5), "le vendeur récupère 90 %");
});

test("§2.6 — garde-fou : 3 reventes par numéro et par mois", async () => {
  const fixture = await seedFixture();
  const vendeur = "+243873333333";
  const seats = await seatsOfChannel(fixture.tripId, "EN_LIGNE", 4);

  for (let i = 0; i < 3; i++) {
    const { tickets } = await buyOnline(fixture, seats[i], vendeur, `hold-${i}`);
    await listForResale({ ticketId: tickets[0].id, actorPhone: vendeur });
  }
  const { tickets } = await buyOnline(fixture, seats[3], vendeur, "hold-3");
  const verdict = await checkResaleEligibility(tickets[0].id);
  assert.equal(verdict.eligible, false);
  assert.match(verdict.raison ?? "", /Limite de 3 reventes/);
});

test("§2.6 — sans acheteur avant la limite, le billet redevient valide", async () => {
  const fixture = await seedFixture();
  const [seat] = await seatsOfChannel(fixture.tripId, "EN_LIGNE", 1);
  const { tickets } = await buyOnline(fixture, seat, "+243874444444");
  const listing = await listForResale({ ticketId: tickets[0].id, actorPhone: "+243874444444" });

  // On force le dépassement de la limite des 4 h avant départ.
  await getDb()
    .prepare(`UPDATE resale_listings SET expires_at = ? WHERE id = ?`)
    .run(new Date(Date.now() - 60_000).toISOString(), listing.id);
  await expireStaleListings();

  const ticket = await getTicket(tickets[0].id);
  assert.equal(ticket.status, "EMIS", "le titulaire d'origine n'a rien perdu");
});

test("§2.6 — la revente ferme 4 h avant le départ", async () => {
  const fixture = await seedFixture({ departureInHours: 3 });
  const [seat] = await seatsOfChannel(fixture.tripId, "EN_LIGNE", 1);
  const { tickets } = await buyOnline(fixture, seat, "+243875555555");
  const verdict = await checkResaleEligibility(tickets[0].id);
  assert.equal(verdict.eligible, false);
  assert.match(verdict.raison ?? "", /moins de 4 h/);
});

// --- §2.6 Transfert --------------------------------------------------------

test("§2.6 — le transfert est gratuit et n'engendre aucun remboursement", async () => {
  const fixture = await seedFixture();
  const [seat] = await seatsOfChannel(fixture.tripId, "GUICHET", 1);
  const session = await openCashSession({
    agencyId: fixture.agencyId,
    userId: fixture.guichetierId,
    openingFloat: 0,
    currency: "USD",
    actorRole: "GUICHETIER",
  });
  const vente = await posSell({
    tripId: fixture.tripId,
    seatNumbers: [seat],
    passengers: [{ seatNumber: seat, name: "Titulaire" }],
    buyerPhone: "+243876666666",
    buyerName: "Titulaire",
    cashSessionId: session.id,
    currency: "USD",
    actor: actorGuichetier(fixture),
  });

  const { ancien, nouveau } = await transferTicket({
    ticketId: vente.tickets[0].id,
    actorPhone: "+243876666666",
    beneficiaryName: "Le Proche",
    beneficiaryPhone: "+243877777777",
  });

  assert.equal(ancien.status, "TRANSFERE");
  assert.equal(nouveau.passenger_phone, "+243877777777");
  assert.equal(nouveau.price_amount, ancien.price_amount, "le prix suit le billet");

  const refunds = (await getDb()
    .prepare<{ n: number }>(`SELECT COUNT(*) AS n FROM refunds WHERE ticket_id = ?`)
    .get(ancien.id)) as { n: number };
  assert.equal(refunds.n, 0, "aucun décaissement : c'est pourquoi le transfert est gratuit");
});

test("§2.6 — le transfert ferme 1 h avant le départ", async () => {
  const fixture = await seedFixture({ departureInHours: 0.5 });
  const [seat] = await seatsOfChannel(fixture.tripId, "EN_LIGNE", 1);
  const { tickets } = await buyOnline(fixture, seat, "+243878888888");
  await assert.rejects(
    () =>
      transferTicket({
        ticketId: tickets[0].id,
        actorPhone: "+243878888888",
        beneficiaryName: "Trop Tard",
        beneficiaryPhone: "+243879999999",
      }),
    (error: unknown) => error instanceof DomainError && error.code === "DELAI_TRANSFERT_DEPASSE",
  );
});

// --- §2.9 Gradient d'incitation -------------------------------------------

test("§2.9 — le gradient récompense l'anticipation", async () => {
  const fixture = await seedFixture({ departureInHours: 48 });
  const [seat] = await seatsOfChannel(fixture.tripId, "EN_LIGNE", 1);
  const { tickets } = await buyOnline(fixture, seat, "+243860000001");

  const grid = await renunciationGrid(tickets[0].id);
  const par = Object.fromEntries(grid.map((o) => [o.action, o]));

  // transférer > revendre > reporter > annuler tard > ne pas venir
  assert.ok(par.TRANSFERT.montant >= par.REVENTE.montant);
  assert.ok(par.REVENTE.montant > par.ANNULATION_TARDIVE.montant);
  assert.ok(par.REPORT.montant > par.ANNULATION_TARDIVE.montant);
  assert.equal(par.NO_SHOW.montant, 0);

  // À 48 h du départ, tout est ouvert sauf l'annulation tardive et le no-show.
  assert.equal(par.TRANSFERT.disponible, true);
  assert.equal(par.REVENTE.disponible, true);
  assert.equal(par.REPORT.disponible, true);
  assert.equal(par.ANNULATION_TARDIVE.disponible, false);
});

test("§2.9 — annulation tardive : 50 % en avoir de 30 jours", async () => {
  const fixture = await seedFixture({ departureInHours: 2 });
  const [seat] = await seatsOfChannel(fixture.tripId, "EN_LIGNE", 1);
  const { tickets } = await buyOnline(fixture, seat, "+243860000002");

  const { credit } = await renounceForCredit({
    ticketId: tickets[0].id,
    actorPhone: "+243860000002",
    action: "ANNULATION_TARDIVE",
  });
  assert.equal(credit.amount, Math.floor(fixture.priceUsd * 0.5));

  const jours = Math.round(
    (new Date(credit.expires_at).getTime() - new Date(credit.issued_at).getTime()) / 86_400_000,
  );
  assert.equal(jours, 30);

  // Le siège revient au stock : il peut être revendu par la compagnie.
  const seatRow = (await getDb()
    .prepare<{ status: string }>(`SELECT status FROM trip_seats WHERE id = ?`)
    .get(tickets[0].trip_seat_id)) as { status: string };
  assert.equal(seatRow.status, "DISPONIBLE");
});

test("§2.9 — report de date : 100 % en avoir de 60 jours", async () => {
  const fixture = await seedFixture({ departureInHours: 24 });
  const [seat] = await seatsOfChannel(fixture.tripId, "EN_LIGNE", 1);
  const { tickets } = await buyOnline(fixture, seat, "+243860000003");

  const { credit } = await renounceForCredit({
    ticketId: tickets[0].id,
    actorPhone: "+243860000003",
    action: "REPORT",
  });
  assert.equal(credit.amount, fixture.priceUsd, "100 % récupérés");
  const jours = Math.round(
    (new Date(credit.expires_at).getTime() - new Date(credit.issued_at).getTime()) / 86_400_000,
  );
  assert.equal(jours, 60);
  assert.equal((await activeCredits("+243860000003")).length, 1);
});

test("§2.9 — no-show : EXPIRE seulement si le trajet est marqué parti", async () => {
  const fixture = await seedFixture({ departureInHours: 1 });
  const [seat] = await seatsOfChannel(fixture.tripId, "GUICHET", 1);
  const session = await openCashSession({
    agencyId: fixture.agencyId,
    userId: fixture.guichetierId,
    openingFloat: 0,
    currency: "USD",
    actorRole: "GUICHETIER",
  });
  const vente = await posSell({
    tripId: fixture.tripId,
    seatNumbers: [seat],
    passengers: [{ seatNumber: seat, name: "Absent" }],
    buyerPhone: "+243860000004",
    buyerName: "Absent",
    cashSessionId: session.id,
    currency: "USD",
    actor: actorGuichetier(fixture),
  });

  // Sans départ effectif enregistré, aucun no-show n'est constatable.
  await assert.rejects(
    () => closeManifest({ tripId: fixture.tripId, actor: { userId: fixture.controleurId, role: "CONTROLEUR" } }),
    (error: unknown) => error instanceof DomainError && error.code === "TRAJET_NON_PARTI",
  );

  await markDeparted({ tripId: fixture.tripId, actor: { userId: fixture.controleurId, role: "CONTROLEUR" } });
  const bilan = await closeManifest({
    tripId: fixture.tripId,
    actor: { userId: fixture.controleurId, role: "CONTROLEUR" },
  });
  assert.equal(bilan.noShows, 1);
  assert.equal((await getTicket(vente.tickets[0].id)).status, "EXPIRE");
});

test("§2.9 — un passager en retard embarque tant que le manifeste est ouvert", async () => {
  const fixture = await seedFixture({ departureInHours: -0.5 }); // bus annoncé il y a 30 min
  const [seat] = await seatsOfChannel(fixture.tripId, "GUICHET", 1);
  const session = await openCashSession({
    agencyId: fixture.agencyId,
    userId: fixture.guichetierId,
    openingFloat: 0,
    currency: "USD",
    actorRole: "GUICHETIER",
  });
  const vente = await posSell({
    tripId: fixture.tripId,
    seatNumbers: [seat],
    passengers: [{ seatNumber: seat, name: "En Retard" }],
    buyerPhone: "+243860000005",
    buyerName: "En Retard",
    cashSessionId: session.id,
    currency: "USD",
    actor: actorGuichetier(fixture),
  });

  // « Un passager arrivé à 8 h 40 pour un bus annoncé à 8 h 00 mais parti à
  // 8 h 45 embarque normalement. »
  const outcome = await scanTicket({ tripId: fixture.tripId, rawQr: vente.tickets[0].qr_signature });
  assert.equal(outcome.result, "ACCEPTE", "l'horaire théorique n'interdit rien");
});

// --- §2.10 Règles commerciales --------------------------------------------

test("§2.10 — pénalité au double du prix pour un siège vendu deux fois", async () => {
  const fixture = await seedFixture();
  const [seat] = await seatsOfChannel(fixture.tripId, "EN_LIGNE", 1);
  const { tickets } = await buyOnline(fixture, seat, "+243850000001");

  const effet = await applyLiability({
    ticketId: tickets[0].id,
    situation: "SIEGE_NON_HONORE",
    actor: { userId: fixture.gerantId, role: "GERANT_AGENCE" },
    note: "Vente parallèle constatée à l'embarquement",
  });
  assert.equal(effet.remboursement, fixture.priceUsd, "100 % remboursés");
  assert.equal(effet.avoir, fixture.priceUsd, "plus un avoir de 100 %");
  assert.equal(effet.impute, "COMPAGNIE_PENALITE");

  const now = new Date();
  const settlement = await computeSettlement({
    companyId: fixture.companyId,
    periodStart: new Date(now.getTime() - 86_400_000).toISOString(),
    periodEnd: new Date(now.getTime() + 86_400_000).toISOString(),
  });
  // La pénalité vaut deux fois le remboursement imputé : vendre un siège hors
  // système devient économiquement absurde.
  assert.equal(settlement.penalties, fixture.priceUsd * 2);
  assert.equal(settlement.refundsCharged, fixture.priceUsd);
});

test("§2.10 — reversement net = ventes − commission − remboursements − pénalités − abonnement", async () => {
  const fixture = await seedFixture();
  const seats = await seatsOfChannel(fixture.tripId, "EN_LIGNE", 2);
  await buyOnline(fixture, seats[0], "+243850000002", "hs0");
  await buyOnline(fixture, seats[1], "+243850000003", "hs1");

  const now = new Date();
  const settlement = await computeSettlement({
    companyId: fixture.companyId,
    periodStart: new Date(now.getTime() - 86_400_000).toISOString(),
    periodEnd: new Date(now.getTime() + 86_400_000).toISOString(),
  });

  assert.equal(settlement.grossSales, fixture.priceUsd * 2);
  assert.equal(settlement.commission, Math.ceil(settlement.grossSales * 0.06));
  assert.equal(
    settlement.netPayable,
    settlement.grossSales -
      settlement.commission -
      settlement.refundsCharged -
      settlement.penalties -
      settlement.subscriptionDue -
      settlement.guaranteeHold,
  );
  // Le détail ligne à ligne est consultable par la compagnie (transparence).
  assert.equal(settlement.lines.length, 6);
});

test("§2.10 — les ventes guichet ne portent pas de commission", async () => {
  const fixture = await seedFixture();
  const [seat] = await seatsOfChannel(fixture.tripId, "GUICHET", 1);
  const session = await openCashSession({
    agencyId: fixture.agencyId,
    userId: fixture.guichetierId,
    openingFloat: 0,
    currency: "USD",
    actorRole: "GUICHETIER",
  });
  await posSell({
    tripId: fixture.tripId,
    seatNumbers: [seat],
    passengers: [{ seatNumber: seat, name: "Guichet" }],
    buyerPhone: "+243850000004",
    buyerName: "Guichet",
    cashSessionId: session.id,
    currency: "USD",
    actor: actorGuichetier(fixture),
  });

  const now = new Date();
  const settlement = await computeSettlement({
    companyId: fixture.companyId,
    periodStart: new Date(now.getTime() - 86_400_000).toISOString(),
    periodEnd: new Date(now.getTime() + 86_400_000).toISOString(),
  });
  assert.equal(settlement.grossSales, 0, "seul le canal en ligne entre dans l'assiette");
  assert.equal(settlement.commission, 0);
});

// --- §2.2 / §2.3 / §2.4 Règles d'exploitation ------------------------------

test("§2.2 — un départ à remplissage n'apparaît jamais dans la recherche en ligne", async () => {
  const fixture = await seedFixture();
  await getDb()
    .prepare(`UPDATE trips SET departure_mode = 'DEPART_A_REMPLISSAGE' WHERE id = ?`)
    .run(fixture.tripId);

  const row = (await getDb()
    .prepare<{ d: string }>(`SELECT departure_datetime AS d FROM trips WHERE id = ?`)
    .get(fixture.tripId)) as { d: string };
  const jour = new Date(row.d).toISOString().slice(0, 10);

  const resultats = await searchTrips({ origin: "Kinshasa", destination: "Matadi", day: jour });
  assert.equal(resultats.length, 0, "aucune heure affichée en ligne pour un départ à remplissage");
});

test("§2.3 — le rééquilibrage déplace le quota et se journalise", async () => {
  const fixture = await seedFixture();
  const avant = await seatAvailability(fixture.tripId);
  const guichetAvant = avant.find((a) => a.channel === "GUICHET")!;
  const ligneAvant = avant.find((a) => a.channel === "EN_LIGNE")!;

  await rebalanceChannel({
    tripId: fixture.tripId,
    from: "EN_LIGNE",
    to: "GUICHET",
    count: 5,
    actor: { userId: fixture.gerantId, role: "GERANT_AGENCE", companyId: fixture.companyId },
  });

  const apres = await seatAvailability(fixture.tripId);
  assert.equal(apres.find((a) => a.channel === "GUICHET")!.quota, guichetAvant.quota + 5);
  assert.equal(apres.find((a) => a.channel === "EN_LIGNE")!.quota, ligneAvant.quota - 5);

  const trace = (await getDb()
    .prepare<{ n: number }>(`SELECT COUNT(*) AS n FROM audit_log WHERE action = 'REEQUILIBRAGE_ALLOCATION'`)
    .get()) as { n: number };
  assert.equal(trace.n, 1, "chaque rééquilibrage est tracé");
});

test("§2.4 — numérotation séquentielle par agence, trou détecté", async () => {
  const fixture = await seedFixture();
  const seats = await seatsOfChannel(fixture.tripId, "GUICHET", 3);
  const session = await openCashSession({
    agencyId: fixture.agencyId,
    userId: fixture.guichetierId,
    openingFloat: 0,
    currency: "USD",
    actorRole: "GUICHETIER",
  });

  // Séquentiel et non parallélisé : la numérotation continue (§2.4) dépend de
  // l'ordre réel des ventes.
  const emis = [];
  for (let index = 0; index < seats.length; index++) {
    const vente = await posSell({
      tripId: fixture.tripId,
      seatNumbers: [seats[index]],
      passengers: [{ seatNumber: seats[index], name: `P${index}` }],
      buyerPhone: "+243840000001",
      buyerName: `P${index}`,
      cashSessionId: session.id,
      currency: "USD",
      actor: actorGuichetier(fixture),
    });
    emis.push(vente.tickets[0]);
  }

  assert.deepEqual(
    emis.map((t) => t.sequence_number),
    [1, 2, 3],
    "séquence continue par agence",
  );
  assert.equal((await detectSequenceGaps(fixture.agencyId)).gaps.length, 0);

  // Un billet effacé hors système laisse un trou : l'alerte doit remonter.
  await getDb().prepare(`DELETE FROM tickets WHERE id = ?`).run(emis[1].id);
  const verdict = await detectSequenceGaps(fixture.agencyId);
  assert.deepEqual(verdict.gaps, [2]);

  const alerte = (await getDb()
    .prepare<{ n: number }>(`SELECT COUNT(*) AS n FROM alerts WHERE kind = 'TROU_SEQUENCE'`)
    .get()) as { n: number };
  assert.equal(alerte.n, 1, "le trou remonte automatiquement au gérant");
});

test("§2.4 — le guichetier ne peut pas annuler ; le gérant doit motiver", async () => {
  const fixture = await seedFixture();
  const [seat] = await seatsOfChannel(fixture.tripId, "GUICHET", 1);
  const session = await openCashSession({
    agencyId: fixture.agencyId,
    userId: fixture.guichetierId,
    openingFloat: 0,
    currency: "USD",
    actorRole: "GUICHETIER",
  });
  const vente = await posSell({
    tripId: fixture.tripId,
    seatNumbers: [seat],
    passengers: [{ seatNumber: seat, name: "À annuler" }],
    buyerPhone: "+243840000002",
    buyerName: "À annuler",
    cashSessionId: session.id,
    currency: "USD",
    actor: actorGuichetier(fixture),
  });

  await assert.rejects(
    () =>
      cancelTicketByManager({
        ticketId: vente.tickets[0].id,
        reason: "   ",
        actor: { userId: fixture.gerantId, role: "GERANT_AGENCE", companyId: fixture.companyId },
      }),
    (error: unknown) => error instanceof DomainError && /motif/i.test(error.message),
    "le motif est obligatoire",
  );

  await cancelTicketByManager({
    ticketId: vente.tickets[0].id,
    reason: "Erreur de saisie du guichetier",
    actor: { userId: fixture.gerantId, role: "GERANT_AGENCE", companyId: fixture.companyId },
  });

  assert.equal((await getTicket(vente.tickets[0].id)).status, "ANNULE");
  const seatRow = (await getDb()
    .prepare<{ status: string }>(`SELECT status FROM trip_seats WHERE id = ?`)
    .get(vente.tickets[0].trip_seat_id)) as { status: string };
  assert.equal(seatRow.status, "DISPONIBLE", "le siège retourne à son canal");

  const trace = (await getDb()
    .prepare<{ after_json: string }>(`SELECT after_json FROM audit_log WHERE action = 'ANNULATION_BILLET'`)
    .get()) as { after_json: string };
  assert.match(trace.after_json, /Erreur de saisie/, "le motif est journalisé");
});

test("§2.5 — un même numéro ne détient pas plus de 3 verrous", async () => {
  const fixture = await seedFixture();
  const seats = await seatsOfChannel(fixture.tripId, "EN_LIGNE", 4);
  const phone = "+243840000003";

  for (let i = 0; i < 3; i++) {
    await holdSeats({ tripId: fixture.tripId, seatNumbers: [seats[i]], holdId: `h${i}`, phone });
  }
  await assert.rejects(
    () => holdSeats({ tripId: fixture.tripId, seatNumbers: [seats[3]], holdId: "h3", phone }),
    (error: unknown) => error instanceof DomainError && error.code === "TROP_DE_VERROUS",
  );
});

test("§2.5 — le verrou expiré rend le siège à son quota d'origine", async () => {
  const fixture = await seedFixture();
  const [seat] = await seatsOfChannel(fixture.tripId, "EN_LIGNE", 1);
  await holdSeats({ tripId: fixture.tripId, seatNumbers: [seat], holdId: "h-expire" });

  await getDb()
    .prepare(`UPDATE trip_seats SET locked_until = ? WHERE trip_id = ? AND seat_number = ?`)
    .run(new Date(Date.now() - 1000).toISOString(), fixture.tripId, seat);

  const rendus = await releaseExpiredLocks();
  assert.ok(rendus >= 1);

  const row = (await getDb()
    .prepare<{ status: string; channel: string }>(
      `SELECT status, channel FROM trip_seats WHERE trip_id = ? AND seat_number = ?`,
    )
    .get(fixture.tripId, seat)) as { status: string; channel: string };
  assert.equal(row.status, "DISPONIBLE");
  assert.equal(row.channel, "EN_LIGNE", "il retourne à son canal, pas à un autre");
});

void withdrawResale;
