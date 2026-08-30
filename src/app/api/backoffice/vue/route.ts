import { authed, body } from "@/lib/api/handler";
import { errors } from "@/lib/core/errors";
import { setAdvancedView } from "@/lib/domain/access";

/**
 * Interrupteur d'affichage du directeur. Il ne peut rien ouvrir : il choisit
 * seulement ce qui s'affiche parmi les modules déjà accordés par Mobembo.
 */
export const PATCH = authed(["ADMIN_COMPAGNIE", "SUPER_ADMIN"], async ({ request, session }) => {
  if (!session.companyId) throw errors.invalid("Compagnie non déterminée.");
  const input = await body<{ vueComplete: boolean }>(request);
  return {
    acces: await setAdvancedView({
      companyId: session.companyId,
      advancedView: Boolean(input.vueComplete),
      actor: { userId: session.userId, role: session.activeRole },
    }),
  };
});
