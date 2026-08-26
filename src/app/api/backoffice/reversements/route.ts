import { authed, body } from "@/lib/api/handler";
import { getDb } from "@/lib/db";
import { computeSettlement, currentSettlementPeriod, markSettlementPaid } from "@/lib/domain/settlements";
import { errors } from "@/lib/core/errors";
import { companyScope } from "@/lib/auth/session";

/**
 * GET — §2.10 « Le détail ligne à ligne est consultable par la compagnie dans
 * son back-office. La transparence évite les litiges. »
 */
export const GET = authed(["ADMIN_COMPAGNIE", "SUPER_ADMIN"], async ({ request, session }) => {
  const companyId = companyScope(session, request.nextUrl.searchParams.get("compagnie"));
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
    const settlement = await getDb()
      .prepare<{ company_id: string }>(`SELECT company_id FROM settlements WHERE id = ?`)
      .get(input.reversementId);
    if (!settlement) throw errors.notFound("Reversement");
    companyScope(session, settlement.company_id);
    await markSettlementPaid(input.reversementId, {
      userId: session.userId,
      role: session.activeRole,
    });
    return { paye: true };
  }

  const companyId = companyScope(session, input.compagnie);
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
