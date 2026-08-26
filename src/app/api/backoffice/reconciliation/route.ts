import { authed } from "@/lib/api/handler";
import { reconcileDay } from "@/lib/domain/payments";
import { companyScope } from "@/lib/auth/session";

/**
 * GET — §3.2 « Réconciliation quotidienne automatique : relevé opérateur
 * contre transactions internes, écarts signalés. »
 */
export const GET = authed(["ADMIN_COMPAGNIE", "SUPER_ADMIN"], async ({ request, session }) => {
  const day = request.nextUrl.searchParams.get("jour") ?? new Date().toISOString().slice(0, 10);
  const companyId = companyScope(session, request.nextUrl.searchParams.get("compagnie"));
  return { jour: day, rapport: await reconcileDay(day, companyId) };
});
