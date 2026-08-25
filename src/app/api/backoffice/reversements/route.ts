import { authed, body } from "@/lib/api/handler";
import { getDb } from "@/lib/db";
import { computeSettlement, currentSettlementPeriod, markSettlementPaid } from "@/lib/domain/settlements";
import { errors } from "@/lib/core/errors";

/**
 * GET — §2.10 « Le détail ligne à ligne est consultable par la compagnie dans
 * son back-office. La transparence évite les litiges. »
 */
export const GET = authed(["ADMIN_COMPAGNIE", "SUPER_ADMIN"], async ({ request, session }) => {
  const companyId = request.nextUrl.searchParams.get("compagnie") ?? session.companyId;
  if (!companyId) throw errors.invalid("Compagnie non déterminée.");
  const db = getDb();

  const settlements = (await db
    .prepare(`SELECT * FROM settlements WHERE company_id = ? ORDER BY period_end DESC LIMIT 26`)
    .all(companyId)) as Array<{ id: string }>;

  return {
    periodeCourante: currentSettlementPeriod(),
    reversements: await Promise.all(
      settlements.map(async (settlement) => ({
        ...settlement,
        lignes: await db
          .prepare(`SELECT * FROM settlement_lines WHERE settlement_id = ?`)
          .all(settlement.id),
      })),
    ),
    grandLivre: await db
      .prepare(`SELECT * FROM company_ledger WHERE company_id = ? ORDER BY created_at DESC LIMIT 50`)
      .all(companyId),
  };
});

/** POST — calcule le reversement d'une période, ou marque un reversement payé. */
export const POST = authed(["ADMIN_COMPAGNIE", "SUPER_ADMIN"], async ({ request, session }) => {
  const input = await body<{
    action: "CALCULER" | "MARQUER_PAYE";
    compagnie?: string;
    du?: string;
    au?: string;
    reversementId?: string;
  }>(request);

  if (input.action === "MARQUER_PAYE") {
    if (!input.reversementId) throw errors.invalid("reversementId requis.");
    await markSettlementPaid(input.reversementId, {
      userId: session.userId,
      role: session.activeRole,
    });
    return { paye: true };
  }

  const companyId = input.compagnie ?? session.companyId;
  if (!companyId) throw errors.invalid("Compagnie non déterminée.");
  const period = currentSettlementPeriod();

  return {
    reversement: await computeSettlement({
      companyId,
      periodStart: input.du ?? period.periodStart,
      periodEnd: input.au ?? period.periodEnd,
      actor: { userId: session.userId, role: session.activeRole },
    }),
  };
});
