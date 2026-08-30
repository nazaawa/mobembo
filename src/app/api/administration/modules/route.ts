import { authed, body } from "@/lib/api/handler";
import { setCompanyModules } from "@/lib/domain/access";
import type { CompanyModule } from "@/lib/domain/modules";

/**
 * Ouverture des phases, agence par agence — §33 : « une nouvelle phase ne doit
 * pas être lancée uniquement parce qu'elle est prévue dans la feuille de
 * route ». C'est un geste humain, tracé dans le journal d'audit.
 */
export const POST = authed(["SUPER_ADMIN"], async ({ request, session }) => {
  const input = await body<{ compagnieId: string; modules: CompanyModule[] }>(request);
  return {
    acces: await setCompanyModules({
      companyId: input.compagnieId,
      modules: input.modules ?? [],
      actor: { userId: session.userId, role: session.activeRole },
    }),
  };
});
