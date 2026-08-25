import { authed, body } from "@/lib/api/handler";
import { getDb, tx } from "@/lib/db";
import { nowIso } from "@/lib/core/time";
import { errors } from "@/lib/core/errors";
import { audit } from "@/lib/domain/audit";
import { companyPolicy, getCompany } from "@/lib/domain/repo";
import { DEFAULT_POLICY, type CompanyPolicy } from "@/lib/domain/types";

/** GET — §2.9 grille paramétrable par compagnie, pré-remplie par défaut. */
export const GET = authed(["ADMIN_COMPAGNIE", "SUPER_ADMIN"], async ({ session }) => {
  if (!session.companyId) throw errors.invalid("Compagnie non déterminée.");
  const company = await getCompany(session.companyId);
  return {
    compagnie: {
      id: company.id,
      nom: company.name,
      commission: company.commission_rate,
      tauxUsdCdf: company.currency_rate_usd_cdf,
      tauxDateA: company.currency_rate_at,
      qrRotationLe: company.qr_secret_rotated_at,
    },
    politique: companyPolicy(company),
    politiqueParDefaut: DEFAULT_POLICY,
    abonnement: await getDb()
      .prepare(`SELECT * FROM subscriptions WHERE company_id = ? ORDER BY period_end DESC LIMIT 1`)
      .get(session.companyId),
  };
});

/** PUT — mise à jour de la grille et du taux de change, journalisée. */
export const PUT = authed(["ADMIN_COMPAGNIE", "SUPER_ADMIN"], async ({ request, session }) => {
  if (!session.companyId) throw errors.invalid("Compagnie non déterminée.");
  const input = await body<{
    politique?: Partial<CompanyPolicy>;
    tauxUsdCdf?: number;
    commission?: number;
  }>(request);

  return tx(async (db) => {
    const before = await getCompany(session.companyId!, db);
    const policy = { ...companyPolicy(before), ...input.politique };

    if (input.commission !== undefined && (input.commission < 0 || input.commission > 0.2)) {
      throw errors.invalid("La commission doit rester entre 0 et 20 %.");
    }

    await db
      .prepare(
        `UPDATE companies
          SET policy_json = ?,
              currency_rate_usd_cdf = COALESCE(?, currency_rate_usd_cdf),
              currency_rate_at = CASE WHEN ? IS NULL THEN currency_rate_at ELSE ? END,
              commission_rate = COALESCE(?, commission_rate)
        WHERE id = ?`,
      )
      .run(
        JSON.stringify(policy),
        input.tauxUsdCdf ?? null,
        input.tauxUsdCdf ?? null,
        nowIso(),
        input.commission ?? null,
        session.companyId,
      );

    await audit(
      {
        userId: session.userId,
        role: session.activeRole,
        companyId: session.companyId,
        action: "MODIFICATION_PARAMETRES",
        entity: "company",
        entityId: session.companyId,
        before: { politique: companyPolicy(before), taux: before.currency_rate_usd_cdf },
        after: { politique: policy, taux: input.tauxUsdCdf },
      },
      db,
    );

    return { politique: policy };
  });
});
