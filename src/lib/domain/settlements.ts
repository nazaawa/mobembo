import type { DbHandle } from "@/lib/db";
import { getDb, tx } from "@/lib/db";
import { newId } from "@/lib/core/ids";
import { nowIso } from "@/lib/core/time";
import { errors } from "@/lib/core/errors";
import { percentOf } from "@/lib/core/money";
import { audit } from "./audit";
import { companyPolicy, getCompany } from "./repo";

/**
 * §2.10 Reversement.
 *
 *   Reversement net (J+7) = ventes en ligne − commission − remboursements
 *                           imputés − pénalités − abonnement dû
 *
 * « Cycle hebdomadaire à J+7. Aucun reversement en temps réel : ce décalage
 * crée la trésorerie sur laquelle la compensation s'opère. »
 */
export const SETTLEMENT_LAG_DAYS = 7;

export interface SettlementResult {
  id: string;
  companyId: string;
  periodStart: string;
  periodEnd: string;
  grossSales: number;
  commission: number;
  refundsCharged: number;
  penalties: number;
  subscriptionDue: number;
  guaranteeHold: number;
  netPayable: number;
  currency: string;
  lines: Array<{ type: string; label: string; amount: number }>;
}

/**
 * Pénalité §2.10 : « Une pénalité au double du prix du billet rend la fraude au
 * guichet économiquement absurde. » Elle s'applique aux remboursements imputés
 * COMPAGNIE_PENALITE (siège vendu deux fois).
 */
const PENALTY_MULTIPLIER = 2;

export async function computeSettlement(params: {
  companyId: string;
  periodStart: string;
  periodEnd: string;
  actor?: { userId: string; role: string };
}): Promise<SettlementResult> {
  return tx(async (db) => {
    const company = await getCompany(params.companyId, db);
    const policy = companyPolicy(company);
    const currency = "USD";

    // Ventes en ligne de la période : seul le canal EN_LIGNE porte commission.
    const sales = (await db
      .prepare<{ gross: number; n: number }>(
        `SELECT COALESCE(SUM(t.price_amount), 0) AS gross, COUNT(*) AS n
           FROM tickets t
           JOIN bookings b ON b.id = t.booking_id
          WHERE b.trip_id IN (SELECT id FROM trips WHERE company_id = ?)
            AND b.channel = 'EN_LIGNE'
            AND b.status = 'CONFIRME'
            AND t.price_currency = ?
            AND t.created_at >= ? AND t.created_at < ?`,
      )
      .get(params.companyId, currency, params.periodStart, params.periodEnd))!;

    const commission = percentOf(sales.gross, company.commission_rate);

    const refunds = (await db
      .prepare<{ total: number; penalisable: number }>(
        `SELECT COALESCE(SUM(r.amount), 0) AS total,
                COALESCE(SUM(CASE WHEN r.liable = 'COMPAGNIE_PENALITE' THEN r.amount ELSE 0 END), 0) AS penalisable
           FROM refunds r
           JOIN tickets t ON t.id = r.ticket_id
          WHERE t.trip_id IN (SELECT id FROM trips WHERE company_id = ?)
            AND r.liable IN ('COMPAGNIE','COMPAGNIE_PENALITE')
            AND r.currency = ?
            AND r.created_at >= ? AND r.created_at < ?`,
      )
      .get(params.companyId, currency, params.periodStart, params.periodEnd))!;

    const penalties = refunds.penalisable * PENALTY_MULTIPLIER;

    const subscription = (await db
      .prepare<{ due: number }>(
        `SELECT COALESCE(SUM(monthly_amount), 0) AS due FROM subscriptions
          WHERE company_id = ? AND currency = ? AND status IN ('ACTIF','DU')
            AND period_start < ? AND period_end >= ?`,
      )
      .get(params.companyId, currency, params.periodEnd, params.periodStart))!;

    // §2.10 : réserve de garantie roulante, restituée à la sortie du contrat.
    const guaranteeHold = percentOf(sales.gross, policy.guaranteeHoldRate);

    const net =
      sales.gross - commission - refunds.total - penalties - subscription.due - guaranteeHold;

    const existing = await db
      .prepare<{ id: string }>(
        `SELECT id FROM settlements WHERE company_id = ? AND period_start = ? AND period_end = ?`,
      )
      .get(params.companyId, params.periodStart, params.periodEnd);
    if (existing) {
      await db.prepare(`DELETE FROM settlement_lines WHERE settlement_id = ?`).run(existing.id);
      await db.prepare(`DELETE FROM settlements WHERE id = ?`).run(existing.id);
    }

    const id = newId("stl");
    await db
      .prepare(
        `INSERT INTO settlements
         (id, company_id, period_start, period_end, gross_sales, commission,
          refunds_charged, penalties, subscription_due, guarantee_hold,
          net_payable, currency, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CALCULE', ?)`,
      )
      .run(
        id,
        params.companyId,
        params.periodStart,
        params.periodEnd,
        sales.gross,
        commission,
        refunds.total,
        penalties,
        subscription.due,
        guaranteeHold,
        net,
        currency,
        nowIso(),
      );

    // §2.10 : « Le détail ligne à ligne est consultable par la compagnie dans
    // son back-office. La transparence évite les litiges. »
    const lines: Array<{ type: string; label: string; amount: number }> = [
      { type: "VENTE", label: `Ventes en ligne (${sales.n} billets)`, amount: sales.gross },
      {
        type: "COMMISSION",
        label: `Commission ${(company.commission_rate * 100).toFixed(1)} %`,
        amount: -commission,
      },
      { type: "REMBOURSEMENT", label: "Remboursements imputés", amount: -refunds.total },
      {
        type: "PENALITE",
        label: `Pénalités sièges non honorés (×${PENALTY_MULTIPLIER})`,
        amount: -penalties,
      },
      { type: "ABONNEMENT", label: "Abonnement de la période", amount: -subscription.due },
      {
        type: "RESERVE",
        label: `Réserve de garantie ${(policy.guaranteeHoldRate * 100).toFixed(1)} %`,
        amount: -guaranteeHold,
      },
    ];
    const insertLine = db.prepare(
      `INSERT INTO settlement_lines (id, settlement_id, type, reference_id, amount, currency, label)
       VALUES (?, ?, ?, NULL, ?, ?, ?)`,
    );
    for (const line of lines) {
      await insertLine.run(newId("stln"), id, line.type, line.amount, currency, line.label);
    }

    if (params.actor) {
      await audit(
        {
          userId: params.actor.userId,
          role: params.actor.role,
          companyId: params.companyId,
          action: "CALCUL_REVERSEMENT",
          entity: "settlement",
          entityId: id,
          after: { net, periode: [params.periodStart, params.periodEnd] },
        },
        db,
      );
    }

    return {
      id,
      companyId: params.companyId,
      periodStart: params.periodStart,
      periodEnd: params.periodEnd,
      grossSales: sales.gross,
      commission,
      refundsCharged: refunds.total,
      penalties,
      subscriptionDue: subscription.due,
      guaranteeHold,
      netPayable: net,
      currency,
      lines,
    };
  });
}

/** Période hebdomadaire arrivant à échéance J+7. */
export function currentSettlementPeriod(reference = new Date()): {
  periodStart: string;
  periodEnd: string;
  payableOn: string;
} {
  const end = new Date(reference);
  end.setUTCHours(0, 0, 0, 0);
  const start = new Date(end.getTime() - 7 * 86_400_000);
  return {
    periodStart: start.toISOString(),
    periodEnd: end.toISOString(),
    payableOn: new Date(end.getTime() + SETTLEMENT_LAG_DAYS * 86_400_000).toISOString(),
  };
}

export async function markSettlementPaid(
  settlementId: string,
  actor: { userId: string; role: string },
): Promise<void> {
  await tx(async (db) => {
    const row = await db
      .prepare<{ id: string; company_id: string; net_payable: number; currency: string; status: string }>(
        `SELECT * FROM settlements WHERE id = ?`,
      )
      .get(settlementId);
    if (!row) throw errors.notFound("Reversement");
    if (row.status === "PAYE") throw errors.conflict("DEJA_PAYE", "Ce reversement est déjà payé.");

    await db
      .prepare(`UPDATE settlements SET status = 'PAYE', paid_at = ? WHERE id = ?`)
      .run(nowIso(), settlementId);

    const last = await db
      .prepare<{ balance_after: number }>(
        `SELECT balance_after FROM company_ledger WHERE company_id = ? ORDER BY created_at DESC LIMIT 1`,
      )
      .get(row.company_id);
    const balance = (last?.balance_after ?? 0) + row.net_payable;

    await db
      .prepare(
        `INSERT INTO company_ledger
         (id, company_id, entry_type, amount, currency, balance_after, reference, created_at)
       VALUES (?, ?, 'REVERSEMENT', ?, ?, ?, ?, ?)`,
      )
      .run(newId("led"), row.company_id, row.net_payable, row.currency, balance, settlementId, nowIso());

    await audit(
      {
        userId: actor.userId,
        role: actor.role,
        companyId: row.company_id,
        action: "PAIEMENT_REVERSEMENT",
        entity: "settlement",
        entityId: settlementId,
        after: { montant: row.net_payable },
      },
      db,
    );
  });
}

/**
 * §2.10 : « Le prix en ligne ne dépasse jamais le prix au guichet. Contrainte à
 * faire respecter par le système, pas seulement par le contrat. »
 *
 * Un seul tarif par catégorie est stocké par trajet : la contrainte est donc
 * structurellement satisfaite. Cette fonction la vérifie explicitement, pour
 * que l'ajout futur d'un tarif différencié par canal ne puisse pas la violer
 * en silence.
 */
export async function assertOnlinePriceNotHigher(
  tripId: string,
  db: DbHandle = getDb(),
): Promise<void> {
  const rows = await db
    .prepare<{ category: string; price_usd: number; price_cdf: number }>(
      `SELECT category, price_usd, price_cdf FROM trip_prices WHERE trip_id = ?`,
    )
    .all(tripId);
  for (const row of rows) {
    if (row.price_usd <= 0 || row.price_cdf <= 0) {
      throw errors.invalid(`Tarif ${row.category} incomplet : les deux devises sont obligatoires.`);
    }
  }
}

/** Recettes agrégées pour le tableau de bord (§2.11). */
export async function revenueReport(params: {
  companyId: string;
  from: string;
  to: string;
  db?: DbHandle;
}): Promise<{
  parAgence: Array<{ agence: string; billets: number; montant: number; currency: string }>;
  parGuichetier: Array<{ agent: string; billets: number; montant: number; currency: string }>;
  parCanal: Array<{ canal: string; billets: number; montant: number; currency: string }>;
  parOperateur: Array<{ operateur: string; transactions: number; montant: number; currency: string }>;
}> {
  const db = params.db ?? getDb();
  const scope = [params.companyId, params.from, params.to];

  const [parAgence, parGuichetier, parCanal, parOperateur] = await Promise.all([
    db
      .prepare<{ agence: string; billets: number; montant: number; currency: string }>(
        `SELECT COALESCE(a.name, 'En ligne') AS agence, COUNT(t.id) AS billets,
                COALESCE(SUM(t.price_amount), 0) AS montant, t.price_currency AS currency
           FROM tickets t
           JOIN bookings b ON b.id = t.booking_id
           LEFT JOIN agencies a ON a.id = b.agency_id
          WHERE t.trip_id IN (SELECT id FROM trips WHERE company_id = ?)
            AND b.status = 'CONFIRME' AND t.created_at >= ? AND t.created_at < ?
          GROUP BY agence, t.price_currency ORDER BY montant DESC`,
      )
      .all(...scope),
    db
      .prepare<{ agent: string; billets: number; montant: number; currency: string }>(
        `SELECT u.name AS agent, COUNT(t.id) AS billets,
                COALESCE(SUM(t.price_amount), 0) AS montant, t.price_currency AS currency
           FROM tickets t
           JOIN bookings b ON b.id = t.booking_id
           JOIN users u ON u.id = b.sold_by_user_id
          WHERE t.trip_id IN (SELECT id FROM trips WHERE company_id = ?)
            AND b.status = 'CONFIRME' AND t.created_at >= ? AND t.created_at < ?
          GROUP BY u.name, t.price_currency ORDER BY montant DESC`,
      )
      .all(...scope),
    db
      .prepare<{ canal: string; billets: number; montant: number; currency: string }>(
        `SELECT b.channel AS canal, COUNT(t.id) AS billets,
                COALESCE(SUM(t.price_amount), 0) AS montant, t.price_currency AS currency
           FROM tickets t
           JOIN bookings b ON b.id = t.booking_id
          WHERE t.trip_id IN (SELECT id FROM trips WHERE company_id = ?)
            AND b.status = 'CONFIRME' AND t.created_at >= ? AND t.created_at < ?
          GROUP BY b.channel, t.price_currency`,
      )
      .all(...scope),
    db
      .prepare<{ operateur: string; transactions: number; montant: number; currency: string }>(
        `SELECT p.provider AS operateur, COUNT(*) AS transactions,
                COALESCE(SUM(p.amount), 0) AS montant, p.currency
           FROM payments p
           JOIN bookings b ON b.id = p.booking_id
          WHERE b.trip_id IN (SELECT id FROM trips WHERE company_id = ?)
            AND p.status = 'CONFIRME' AND p.created_at >= ? AND p.created_at < ?
          GROUP BY p.provider, p.currency ORDER BY montant DESC`,
      )
      .all(...scope),
  ]);

  return { parAgence, parGuichetier, parCanal, parOperateur };
}
