import type { DbHandle } from "@/lib/db";
import { getDb, tx } from "@/lib/db";
import { newId } from "@/lib/core/ids";
import { nowIso } from "@/lib/core/time";
import { errors, DomainError } from "@/lib/core/errors";
import type { Currency } from "@/lib/core/money";
import { formatMoney } from "@/lib/core/money";
import { audit, raiseAlert } from "./audit";
import { confirmBooking } from "./bookings";
import { extendLocks, releaseLocks } from "./seats";
import { getProvider } from "@/lib/payments/registry";
import { flushSmsQueue } from "@/lib/sms";
import {
  bookingPassengers,
  type PassengerInput,
} from "./bookings";
import {
  companyPolicy,
  getBooking,
  getCompany,
  getTrip,
  type PaymentRow,
  type TicketRow,
} from "./repo";
import type { PaymentProviderId } from "./types";

/** §3.2 : « Polling de secours toutes les 30 s pendant 5 min. » */
export const POLL_INTERVAL_MS = 30_000;
export const POLL_WINDOW_MS = 5 * 60_000;
export const MAX_POLLS = Math.floor(POLL_WINDOW_MS / POLL_INTERVAL_MS);

export interface InitiateResult {
  payment: PaymentRow;
  lockedUntil: string;
  /** Vrai si la clé d'idempotence a déjà servi : aucun nouveau débit. */
  replayed: boolean;
}

/**
 * §3.2 : « Clé d'idempotence obligatoire sur chaque initiation de paiement. Un
 * double clic ne débite jamais deux fois. »
 *
 * L'unicité est portée par l'index unique `payments(idempotency_key)` : c'est
 * la base qui refuse le doublon, pas un test applicatif qui se ferait doubler
 * par deux requêtes simultanées.
 */
export async function initiatePayment(params: {
  bookingId: string;
  provider: PaymentProviderId;
  payerPhone: string;
  idempotencyKey: string;
}): Promise<InitiateResult> {
  const db = getDb();

  const existing = (await db
    .prepare(`SELECT * FROM payments WHERE idempotency_key = ?`)
    .get(params.idempotencyKey)) as PaymentRow | undefined;
  if (existing) {
    const booking = await getBooking(existing.booking_id, db);
    const { holdId } = await bookingPassengers(booking.id, db);
    const seat = (await db
      .prepare(`SELECT locked_until FROM trip_seats WHERE lock_session_id = ? LIMIT 1`)
      .get(holdId)) as { locked_until: string | null } | undefined;
    return { payment: existing, lockedUntil: seat?.locked_until ?? "", replayed: true };
  }

  const booking = await getBooking(params.bookingId, db);
  if (booking.status !== "EN_ATTENTE") {
    throw errors.conflict("RESERVATION_CLOSE", "Cette réservation n'attend plus de paiement.");
  }
  const trip = await getTrip(booking.trip_id, db);
  const company = await getCompany(trip.company_id, db);
  const policy = companyPolicy(company);
  const amountDue = booking.total_amount - booking.credit_applied;

  if (amountDue <= 0) {
    // Entièrement réglée par un avoir : aucun opérateur n'est sollicité.
    const tickets = await tx((inner) => confirmBooking(inner, booking.id));
    await flushSmsQueue(db);
    const settled = (await db
      .prepare(`SELECT * FROM payments WHERE booking_id = ?`)
      .get(booking.id)) as PaymentRow | undefined;
    return {
      payment:
        settled ??
        (await recordCreditPayment(
          db,
          booking.id,
          params.idempotencyKey,
          booking.currency as Currency,
          tickets,
        )),
      lockedUntil: "",
      replayed: false,
    };
  }

  const paymentId = newId("pay");
  const { holdId } = await bookingPassengers(booking.id, db);

  const lockedUntil = await tx(async (inner) => {
    await inner
      .prepare(
        `INSERT INTO payments
           (id, booking_id, provider, provider_ref, idempotency_key, payer_phone,
            amount, currency, fx_rate, fx_rate_at, status, created_at)
         VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, 'INITIE', ?)`,
      )
      .run(
        paymentId,
        booking.id,
        params.provider,
        params.idempotencyKey,
        params.payerPhone,
        amountDue,
        booking.currency,
        company.currency_rate_usd_cdf,
        company.currency_rate_at ?? nowIso(),
        nowIso(),
      );
    // §2.5 : « Paiement initié dans le délai : le verrou est prolongé
    // automatiquement jusqu'à résolution, 15 minutes supplémentaires. »
    return extendLocks(inner, booking.trip_id, holdId, policy.seatLockPaymentExtensionMinutes);
  });

  const provider = getProvider(params.provider);
  const result = await provider.charge({
    idempotencyKey: params.idempotencyKey,
    payerPhone: params.payerPhone,
    amount: amountDue,
    currency: booking.currency as Currency,
    reference: booking.id,
    description: `Mobembo ${booking.id}`,
  });

  await db
    .prepare(`UPDATE payments SET provider_ref = ?, raw_response = ? WHERE id = ?`)
    .run(result.providerRef, JSON.stringify(result.raw), paymentId);

  if (result.status === "CONFIRME") {
    await settlePayment(paymentId, "CONFIRME", result.raw);
  } else if (result.status === "ECHOUE") {
    await settlePayment(paymentId, "ECHOUE", result.raw);
  }

  return {
    payment: (await db.prepare<PaymentRow>(`SELECT * FROM payments WHERE id = ?`).get(paymentId)) as PaymentRow,
    lockedUntil,
    replayed: false,
  };
}

async function recordCreditPayment(
  db: DbHandle,
  bookingId: string,
  idempotencyKey: string,
  currency: Currency,
  tickets: TicketRow[],
): Promise<PaymentRow> {
  const id = newId("pay");
  await db
    .prepare(
      `INSERT INTO payments
       (id, booking_id, provider, provider_ref, idempotency_key, payer_phone,
        amount, currency, status, created_at, resolved_at)
     VALUES (?, ?, 'AVOIR', NULL, ?, '', 0, ?, 'CONFIRME', ?, ?)`,
    )
    .run(id, bookingId, idempotencyKey, currency, nowIso(), nowIso());
  await audit(
    { action: "PAIEMENT_PAR_AVOIR", entity: "booking", entityId: bookingId, after: { tickets: tickets.length } },
    db,
  );
  return (await db.prepare<PaymentRow>(`SELECT * FROM payments WHERE id = ?`).get(id)) as PaymentRow;
}

/**
 * Résolution d'un paiement, quelle que soit sa source : webhook (mécanisme
 * principal, §3.2) ou polling de secours. L'opération est idempotente — un
 * webhook rejoué n'émet pas un second jeu de billets.
 */
export async function settlePayment(
  paymentId: string,
  status: "CONFIRME" | "ECHOUE" | "INDETERMINE",
  raw?: unknown,
): Promise<{ payment: PaymentRow; tickets: TicketRow[] }> {
  const outcome = await tx(async (db) => {
    const payment = (await db.prepare(`SELECT * FROM payments WHERE id = ?`).get(paymentId)) as
      | PaymentRow
      | undefined;
    if (!payment) throw errors.notFound("Paiement");

    if (payment.status === "CONFIRME") {
      return {
        payment,
        tickets: await db
          .prepare<TicketRow>(`SELECT * FROM tickets WHERE booking_id = ?`)
          .all(payment.booking_id),
      };
    }
    if (payment.status === "ECHOUE") return { payment, tickets: [] as TicketRow[] };

    await db
      .prepare(
        `UPDATE payments SET status = ?, raw_response = COALESCE(?, raw_response), resolved_at = ?
        WHERE id = ?`,
      )
      .run(
        status,
        raw === undefined ? null : JSON.stringify(raw),
        status === "INDETERMINE" ? null : nowIso(),
        paymentId,
      );

    let tickets: TicketRow[] = [];
    let statutFinal: typeof status = status;
    if (status === "CONFIRME") {
      try {
        tickets = await confirmBooking(db, payment.booking_id);
      } catch (error) {
        if (!(error instanceof DomainError) || error.code !== "VERROU_PERDU") throw error;
        // Un paiement confirmé par l'opérateur ne doit jamais rester en
        // limbo (§3.2 : « aucun incident ne disparaît silencieusement »).
        // Ici l'opérateur a confirmé, mais le verrou du siège avait déjà
        // expiré avant que la confirmation n'arrive — trop de temps écoulé
        // entre l'initiation et la reprise du paiement. Impossible d'émettre
        // le billet : le paiement bascule ECHOUE (pas de billet à délivrer)
        // et un ticket support signale l'anomalie, un opérateur ayant débité
        // sans contrepartie.
        statutFinal = "ECHOUE";
        await db
          .prepare(`UPDATE payments SET status = 'ECHOUE', resolved_at = ? WHERE id = ?`)
          .run(nowIso(), paymentId);
        const booking = await getBooking(payment.booking_id, db);
        const { holdId } = await bookingPassengers(booking.id, db);
        await releaseLocks(db, booking.trip_id, holdId);
        await db.prepare(`UPDATE bookings SET status = 'EXPIRE' WHERE id = ?`).run(booking.id);
        await openLockLostSupportTicket(db, payment, error.message);
      }
    } else if (status === "ECHOUE") {
      const booking = await getBooking(payment.booking_id, db);
      const { holdId } = await bookingPassengers(booking.id, db);
      await releaseLocks(db, booking.trip_id, holdId);
      await db.prepare(`UPDATE bookings SET status = 'EXPIRE' WHERE id = ?`).run(booking.id);
    }
    // INDETERMINE : §3.2 « le siège reste verrouillé ». Aucun release ici.

    await audit(
      {
        action: `PAIEMENT_${statutFinal}`,
        entity: "payment",
        entityId: paymentId,
        before: { status: payment.status },
        after: { status: statutFinal },
      },
      db,
    );

    return {
      payment: (await db.prepare<PaymentRow>(`SELECT * FROM payments WHERE id = ?`).get(paymentId)) as PaymentRow,
      tickets,
    };
  });

  await flushSmsQueue();
  return outcome;
}

/**
 * §3.2 : « Polling de secours toutes les 30 s pendant 5 min si aucun webhook
 * n'arrive. Aucune réservation n'est annulée sans vérification du statut réel
 * auprès de l'opérateur. Statut INDETERMINE : après 5 min sans réponse, le
 * siège reste verrouillé et un ticket support est créé automatiquement. Un
 * humain tranche. Le système ne devine jamais. »
 */
export async function pollPayment(paymentId: string): Promise<PaymentRow> {
  const db = getDb();
  const payment = (await db.prepare(`SELECT * FROM payments WHERE id = ?`).get(paymentId)) as
    | PaymentRow
    | undefined;
  if (!payment) throw errors.notFound("Paiement");
  if (payment.status !== "INITIE") return payment;
  if (!payment.provider_ref) return payment;

  const elapsed = Date.now() - new Date(payment.created_at).getTime();
  const provider = getProvider(payment.provider as PaymentProviderId);
  const result = await provider.pollCharge(payment.provider_ref);

  await db
    .prepare(`UPDATE payments SET polls = polls + 1, last_polled_at = ? WHERE id = ?`)
    .run(nowIso(), paymentId);

  if (result.status === "CONFIRME" || result.status === "ECHOUE") {
    const settled = await settlePayment(paymentId, result.status, result.raw);
    return settled.payment;
  }

  if (elapsed >= POLL_WINDOW_MS) {
    // Cinq minutes sans réponse ferme : on n'invente pas de verdict.
    const settled = await settlePayment(paymentId, "INDETERMINE", result.raw);
    await openIndeterminateSupportTicket(db, settled.payment);
    return settled.payment;
  }

  return (await db.prepare<PaymentRow>(`SELECT * FROM payments WHERE id = ?`).get(paymentId)) as PaymentRow;
}

async function openLockLostSupportTicket(db: DbHandle, payment: PaymentRow, raison: string): Promise<void> {
  const already = (await db
    .prepare(`SELECT COUNT(*) AS n FROM support_tickets WHERE reference = ?`)
    .get(payment.id)) as { n: number };
  if (already.n > 0) return;

  await db
    .prepare(
      `INSERT INTO support_tickets (id, kind, reference, severity, body, status, created_at)
     VALUES (?, 'PAIEMENT_CONFIRME_SANS_SIEGE', ?, 'BLOQUANTE', ?, 'OUVERT', ?)`,
    )
    .run(
      newId("sup"),
      payment.id,
      `Paiement ${payment.id} (${payment.provider}, ref ${payment.provider_ref ?? "—"}) confirmé par ` +
        `l'opérateur pour ${formatMoney(payment.amount, payment.currency as Currency)} depuis ` +
        `${payment.payer_phone}, mais le siège n'était plus maintenu (${raison}). Aucun billet émis : ` +
        `vérifier si l'opérateur a réellement débité et rembourser si nécessaire.`,
      nowIso(),
    );
  await raiseAlert(
    {
      kind: "PAIEMENT_CONFIRME_SANS_SIEGE",
      severity: "BLOQUANTE",
      reference: payment.id,
      body: `Paiement confirmé sans siège à livrer — vérification humaine requise.`,
    },
    db,
  );
}

async function openIndeterminateSupportTicket(db: DbHandle, payment: PaymentRow): Promise<void> {
  const already = (await db
    .prepare(`SELECT COUNT(*) AS n FROM support_tickets WHERE reference = ?`)
    .get(payment.id)) as { n: number };
  if (already.n > 0) return;

  await db
    .prepare(
      `INSERT INTO support_tickets (id, kind, reference, severity, body, status, created_at)
     VALUES (?, 'PAIEMENT_INDETERMINE', ?, 'BLOQUANTE', ?, 'OUVERT', ?)`,
    )
    .run(
      newId("sup"),
      payment.id,
      `Paiement ${payment.id} (${payment.provider}, ref ${payment.provider_ref ?? "—"}) ` +
        `sans réponse après 5 minutes. Montant ${formatMoney(payment.amount, payment.currency as Currency)} ` +
        `depuis ${payment.payer_phone}. Le siège reste verrouillé jusqu'à décision humaine.`,
      nowIso(),
    );
  await raiseAlert(
    {
      kind: "PAIEMENT_INDETERMINE",
      severity: "BLOQUANTE",
      reference: payment.id,
      body: `Paiement en statut indéterminé — arbitrage humain requis.`,
    },
    db,
  );
}

/** Arbitrage humain d'un paiement indéterminé (§3.2). */
export async function resolveIndeterminate(params: {
  paymentId: string;
  decision: "CONFIRME" | "ECHOUE";
  note: string;
  actor: { userId: string; role: string };
}): Promise<{ payment: PaymentRow; tickets: TicketRow[] }> {
  const db = getDb();
  const payment = (await db.prepare(`SELECT * FROM payments WHERE id = ?`).get(params.paymentId)) as
    | PaymentRow
    | undefined;
  if (!payment) throw errors.notFound("Paiement");
  if (payment.status !== "INDETERMINE") {
    throw errors.conflict("PAIEMENT_NON_INDETERMINE", "Ce paiement n'est pas en attente d'arbitrage.");
  }

  await db.prepare(`UPDATE payments SET status = 'INITIE' WHERE id = ?`).run(params.paymentId);
  const outcome = await settlePayment(params.paymentId, params.decision, {
    arbitrage: params.decision,
    note: params.note,
    par: params.actor.userId,
  });

  await db
    .prepare(`UPDATE support_tickets SET status = 'RESOLU', closed_at = ? WHERE reference = ?`)
    .run(nowIso(), params.paymentId);
  await audit(
    {
      userId: params.actor.userId,
      role: params.actor.role,
      action: "ARBITRAGE_PAIEMENT",
      entity: "payment",
      entityId: params.paymentId,
      after: { decision: params.decision, note: params.note },
    },
    db,
  );
  return outcome;
}

/**
 * §3.2 : « Réconciliation quotidienne automatique : relevé opérateur contre
 * transactions internes, écarts signalés. »
 */
export async function reconcileDay(day: string, companyId?: string): Promise<{
  provider: PaymentProviderId;
  internes: number;
  releve: number;
  ecarts: Array<{ providerRef: string; probleme: string }>;
}[]> {
  const db = getDb();
  const start = `${day}T00:00:00.000Z`;
  const end = `${day}T23:59:59.999Z`;
  const report: Array<{
    provider: PaymentProviderId;
    internes: number;
    releve: number;
    ecarts: Array<{ providerRef: string; probleme: string }>;
  }> = [];

  for (const providerId of ["MPESA", "ORANGE_MONEY", "AIRTEL_MONEY"] as PaymentProviderId[]) {
    const internal = (await db
      .prepare(
        `SELECT p.provider_ref, p.amount, p.currency, p.status FROM payments p
          JOIN bookings b ON b.id = p.booking_id
          JOIN trips t ON t.id = b.trip_id
          WHERE p.provider = ? AND p.created_at BETWEEN ? AND ? AND p.provider_ref IS NOT NULL
            AND (? IS NULL OR t.company_id = ?)`,
      )
      .all(providerId, start, end, companyId ?? null, companyId ?? null)) as Array<{
      provider_ref: string;
      amount: number;
      currency: string;
      status: string;
    }>;

    const statement = await getProvider(providerId).statement(day);
    const internalRefs = new Set(internal.map((row) => row.provider_ref));
    const scopedStatement = companyId
      ? statement.filter((line) => internalRefs.has(line.providerRef))
      : statement;
    const byRef = new Map(scopedStatement.map((line) => [line.providerRef, line]));
    const ecarts: Array<{ providerRef: string; probleme: string }> = [];

    for (const row of internal) {
      const line = byRef.get(row.provider_ref);
      if (!line) {
        if (row.status === "CONFIRME") {
          ecarts.push({ providerRef: row.provider_ref, probleme: "Confirmé chez nous, absent du relevé." });
        }
        continue;
      }
      if (line.amount !== row.amount || line.currency !== row.currency) {
        ecarts.push({ providerRef: row.provider_ref, probleme: "Montant ou devise divergents." });
      }
      byRef.delete(row.provider_ref);
    }
    for (const orphan of byRef.keys()) {
      ecarts.push({ providerRef: orphan, probleme: "Présent au relevé, inconnu en interne." });
    }

    if (ecarts.length > 0) {
      await raiseAlert(
        {
          kind: "PAIEMENT_INDETERMINE",
          severity: "MAJEURE",
          reference: `${providerId}:${day}`,
          body: `Réconciliation ${day} / ${providerId} : ${ecarts.length} écart(s).`,
        },
        db,
      );
    }
    report.push({ provider: providerId, internes: internal.length, releve: scopedStatement.length, ecarts });
  }
  return report;
}

export type { PassengerInput };
