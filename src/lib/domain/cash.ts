import type { Database } from "better-sqlite3";
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
export function openCashSession(params: {
  agencyId: string;
  userId: string;
  openingFloat: number;
  currency: Currency;
  deviceId?: string | null;
  actorRole: string;
}): CashSessionRow {
  return tx((db) => {
    const open = db
      .prepare(
        `SELECT id FROM cash_sessions WHERE user_id = ? AND agency_id = ? AND closed_at IS NULL`,
      )
      .get(params.userId, params.agencyId) as { id: string } | undefined;
    if (open) {
      throw errors.conflict(
        "CAISSE_DEJA_OUVERTE",
        "Une session de caisse est déjà ouverte pour cet agent. Fermez-la d'abord.",
      );
    }
    if (params.openingFloat < 0) throw errors.invalid("Le fond de caisse ne peut être négatif.");

    const id = newId("csh");
    db.prepare(
      `INSERT INTO cash_sessions
         (id, agency_id, user_id, opened_at, opening_float, currency, device_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      params.agencyId,
      params.userId,
      nowIso(),
      params.openingFloat,
      params.currency,
      params.deviceId ?? null,
      nowIso(),
    );

    const agency = getAgency(params.agencyId, db);
    audit(
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
    return db.prepare(`SELECT * FROM cash_sessions WHERE id = ?`).get(id) as CashSessionRow;
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

export function cashSessionSummary(
  sessionId: string,
  db: Database = getDb(),
): CashSessionSummary {
  const session = db.prepare(`SELECT * FROM cash_sessions WHERE id = ?`).get(sessionId) as
    | CashSessionRow
    | undefined;
  if (!session) throw errors.notFound("Session de caisse");

  const totals = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN type = 'VENTE' THEN amount ELSE 0 END), 0) AS ventes,
         COALESCE(SUM(CASE WHEN type IN ('REMBOURSEMENT','ANNULATION') THEN amount ELSE 0 END), 0) AS remboursements
       FROM cash_movements WHERE cash_session_id = ?`,
    )
    .get(sessionId) as { ventes: number; remboursements: number };

  const tickets = db
    .prepare(
      `SELECT COUNT(*) AS n FROM tickets t
         JOIN bookings b ON b.id = t.booking_id
        WHERE b.cash_session_id = ?`,
    )
    .get(sessionId) as { n: number };

  const mouvements = db
    .prepare(
      `SELECT id, type, amount, currency, label, created_at FROM cash_movements
        WHERE cash_session_id = ? ORDER BY created_at DESC`,
    )
    .all(sessionId) as CashSessionSummary["mouvements"];

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
export function closeCashSession(params: {
  sessionId: string;
  countedAmount: number;
  actor: { userId: string; role: string };
  ip?: string | null;
  device?: string | null;
}): CashSessionSummary & { variance: number } {
  return tx((db) => {
    const summary = cashSessionSummary(params.sessionId, db);
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
    db.prepare(
      `UPDATE cash_sessions SET closed_at = ?, counted_amount = ?, variance = ?
        WHERE id = ? AND closed_at IS NULL`,
    ).run(nowIso(), params.countedAmount, variance, params.sessionId);

    const agency = getAgency(summary.session.agency_id, db);
    const policy = companyPolicy(getCompany(agency.company_id, db));

    audit(
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
      raiseAlert(
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

    return { ...cashSessionSummary(params.sessionId, db), variance };
  });
}

export function openSessionFor(
  userId: string,
  agencyId: string,
  db: Database = getDb(),
): CashSessionRow | null {
  return (
    (db
      .prepare(
        `SELECT * FROM cash_sessions WHERE user_id = ? AND agency_id = ? AND closed_at IS NULL`,
      )
      .get(userId, agencyId) as CashSessionRow | undefined) ?? null
  );
}

/**
 * Remboursement en espèces au guichet — mouvement de caisse négatif entrant
 * dans le calcul d'écart. Réservé au gérant (§2.4 contraintes anti-fraude).
 */
export function recordCashRefund(params: {
  sessionId: string;
  bookingId: string | null;
  amount: number;
  currency: Currency;
  label: string;
  actor: { userId: string; role: string };
}): void {
  tx((db) => {
    const session = db.prepare(`SELECT * FROM cash_sessions WHERE id = ?`).get(params.sessionId) as
      | CashSessionRow
      | undefined;
    if (!session) throw errors.notFound("Session de caisse");
    if (session.closed_at) throw errors.conflict("CAISSE_FERMEE", "Session déjà fermée.");

    db.prepare(
      `INSERT INTO cash_movements
         (id, cash_session_id, booking_id, type, amount, currency, label, created_at)
       VALUES (?, ?, ?, 'REMBOURSEMENT', ?, ?, ?, ?)`,
    ).run(
      newId("cmv"),
      params.sessionId,
      params.bookingId,
      params.amount,
      params.currency,
      params.label,
      nowIso(),
    );
    audit(
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
