import type { DbHandle } from "@/lib/db";
import { getDb, tx } from "@/lib/db";
import { newId } from "@/lib/core/ids";
import { nowIso } from "@/lib/core/time";
import { errors } from "@/lib/core/errors";
import type { Currency } from "@/lib/core/money";
import { formatMoney } from "@/lib/core/money";
import { audit, raiseAlert } from "./audit";
import { companyPolicy, getAgency, getCompany, type CashSessionRow } from "./repo";

/**
 * §2.4 Session de caisse.
 *
 *   Écart = Montant compté − (Fond initial + Σ ventes − Σ remboursements autorisés)
 *
 * Cette formule est la raison d'être commerciale du produit (§4.1 : « Le
 * dirigeant voit pour la première fois ses recettes réelles »). Elle est
 * calculée par le serveur, jamais saisie.
 */
export async function openCashSession(params: {
  agencyId: string;
  userId: string;
  openingFloat: number;
  currency: Currency;
  deviceId?: string | null;
  actorRole: string;
}): Promise<CashSessionRow> {
  return tx(async (db) => {
    const open = await db
      .prepare<{ id: string }>(
        `SELECT id FROM cash_sessions WHERE user_id = ? AND agency_id = ? AND closed_at IS NULL`,
      )
      .get(params.userId, params.agencyId);
    if (open) {
      throw errors.conflict(
        "CAISSE_DEJA_OUVERTE",
        "Une session de caisse est déjà ouverte pour cet agent. Fermez-la d'abord.",
      );
    }
    if (params.openingFloat < 0) throw errors.invalid("Le fond de caisse ne peut être négatif.");

    const id = newId("csh");
    await db
      .prepare(
        `INSERT INTO cash_sessions
         (id, agency_id, user_id, opened_at, opening_float, currency, device_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        params.agencyId,
        params.userId,
        nowIso(),
        params.openingFloat,
        params.currency,
        params.deviceId ?? null,
        nowIso(),
      );

    const agency = await getAgency(params.agencyId, db);
    await audit(
      {
        userId: params.userId,
        role: params.actorRole,
        companyId: agency.company_id,
        action: "OUVERTURE_CAISSE",
        entity: "cash_session",
        entityId: id,
        after: { fond: params.openingFloat, devise: params.currency },
        device: params.deviceId,
      },
      db,
    );
    return (await db.prepare<CashSessionRow>(`SELECT * FROM cash_sessions WHERE id = ?`).get(
      id,
    )) as CashSessionRow;
  });
}

export interface CashSessionSummary {
  session: CashSessionRow;
  ventes: number;
  remboursements: number;
  nbBillets: number;
  attendu: number;
  mouvements: Array<{
    id: string;
    type: string;
    amount: number;
    currency: string;
    label: string | null;
    created_at: string;
  }>;
}

export async function cashSessionSummary(
  sessionId: string,
  db: DbHandle = getDb(),
): Promise<CashSessionSummary> {
  const session = await db
    .prepare<CashSessionRow>(`SELECT * FROM cash_sessions WHERE id = ?`)
    .get(sessionId);
  if (!session) throw errors.notFound("Session de caisse");

  const totals = (await db
    .prepare<{ ventes: number; remboursements: number }>(
      `SELECT
         COALESCE(SUM(CASE WHEN type = 'VENTE' THEN amount ELSE 0 END), 0) AS ventes,
         COALESCE(SUM(CASE WHEN type IN ('REMBOURSEMENT','ANNULATION') THEN amount ELSE 0 END), 0) AS remboursements
       FROM cash_movements WHERE cash_session_id = ?`,
    )
    .get(sessionId)) as { ventes: number; remboursements: number };

  const tickets = (await db
    .prepare<{ n: number }>(
      `SELECT COUNT(*) AS n FROM tickets t
         JOIN bookings b ON b.id = t.booking_id
        WHERE b.cash_session_id = ?`,
    )
    .get(sessionId)) as { n: number };

  const mouvements = await db
    .prepare<CashSessionSummary["mouvements"][number]>(
      `SELECT id, type, amount, currency, label, created_at FROM cash_movements
        WHERE cash_session_id = ? ORDER BY created_at DESC`,
    )
    .all(sessionId);

  return {
    session,
    ventes: totals.ventes,
    remboursements: totals.remboursements,
    nbBillets: tickets.n,
    attendu: session.opening_float + totals.ventes - totals.remboursements,
    mouvements,
  };
}

/**
 * §2.4 : « Une session ne peut être fermée deux fois ni modifiée après
 * fermeture. » L'écart s'affiche immédiatement au gérant.
 */
export async function closeCashSession(params: {
  sessionId: string;
  countedAmount: number;
  actor: { userId: string; role: string };
  ip?: string | null;
  device?: string | null;
}): Promise<CashSessionSummary & { variance: number }> {
  return tx(async (db) => {
    const summary = await cashSessionSummary(params.sessionId, db);
    if (summary.session.closed_at) {
      throw errors.conflict("CAISSE_DEJA_FERMEE", "Cette session est déjà fermée.");
    }
    if (
      summary.session.user_id !== params.actor.userId &&
      !["GERANT_AGENCE", "ADMIN_COMPAGNIE", "SUPER_ADMIN"].includes(params.actor.role)
    ) {
      throw errors.forbidden("Seul l'agent titulaire ou son gérant ferme cette caisse.");
    }

    const variance = params.countedAmount - summary.attendu;
    await db
      .prepare(
        `UPDATE cash_sessions SET closed_at = ?, counted_amount = ?, variance = ?
        WHERE id = ? AND closed_at IS NULL`,
      )
      .run(nowIso(), params.countedAmount, variance, params.sessionId);

    const agency = await getAgency(summary.session.agency_id, db);
    const policy = companyPolicy(await getCompany(agency.company_id, db));

    await audit(
      {
        userId: params.actor.userId,
        role: params.actor.role,
        companyId: agency.company_id,
        action: "FERMETURE_CAISSE",
        entity: "cash_session",
        entityId: params.sessionId,
        before: { attendu: summary.attendu },
        after: { compte: params.countedAmount, ecart: variance },
        ip: params.ip,
        device: params.device,
      },
      db,
    );

    // §2.11 : « écart de caisse au-delà du seuil » déclenche une alerte.
    if (Math.abs(variance) > policy.cashVarianceAlertThreshold) {
      await raiseAlert(
        {
          kind: "ECART_CAISSE",
          severity: "MAJEURE",
          companyId: agency.company_id,
          agencyId: agency.id,
          reference: params.sessionId,
          body:
            `Écart de caisse de ${formatMoney(variance, summary.session.currency as Currency)} ` +
            `sur la session ${params.sessionId} (seuil : ` +
            `${formatMoney(policy.cashVarianceAlertThreshold, summary.session.currency as Currency)}).`,
        },
        db,
      );
    }

    return { ...(await cashSessionSummary(params.sessionId, db)), variance };
  });
}

export async function openSessionFor(
  userId: string,
  agencyId: string,
  db: DbHandle = getDb(),
): Promise<CashSessionRow | null> {
  return (
    (await db
      .prepare<CashSessionRow>(
        `SELECT * FROM cash_sessions WHERE user_id = ? AND agency_id = ? AND closed_at IS NULL`,
      )
      .get(userId, agencyId)) ?? null
  );
}

/**
 * Remboursement en espèces au guichet — mouvement de caisse négatif entrant
 * dans le calcul d'écart. Réservé au gérant (§2.4 contraintes anti-fraude).
 */
export async function recordCashRefund(params: {
  sessionId: string;
  bookingId: string | null;
  amount: number;
  currency: Currency;
  label: string;
  actor: { userId: string; role: string };
}): Promise<void> {
  await tx(async (db) => {
    const session = await db
      .prepare<CashSessionRow>(`SELECT * FROM cash_sessions WHERE id = ?`)
      .get(params.sessionId);
    if (!session) throw errors.notFound("Session de caisse");
    if (session.closed_at) throw errors.conflict("CAISSE_FERMEE", "Session déjà fermée.");

    await db
      .prepare(
        `INSERT INTO cash_movements
         (id, cash_session_id, booking_id, type, amount, currency, label, created_at)
       VALUES (?, ?, ?, 'REMBOURSEMENT', ?, ?, ?, ?)`,
      )
      .run(
        newId("cmv"),
        params.sessionId,
        params.bookingId,
        params.amount,
        params.currency,
        params.label,
        nowIso(),
      );
    await audit(
      {
        userId: params.actor.userId,
        role: params.actor.role,
        action: "REMBOURSEMENT_CAISSE",
        entity: "cash_session",
        entityId: params.sessionId,
        after: { montant: params.amount, devise: params.currency, motif: params.label },
      },
      db,
    );
  });
}
