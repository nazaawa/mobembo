import { authed, body } from "@/lib/api/handler";
import { setCompanyListed } from "@/lib/domain/directory";

/**
 * §6 : « Mobembo peut désactiver temporairement une information manifestement
 * incorrecte. » Retirer une agence de l'annuaire ne la suspend pas : ses
 * comptes, ses ventes et ses billets continuent de fonctionner, elle cesse
 * seulement d'être proposée aux voyageurs.
 */
export const POST = authed(["SUPER_ADMIN"], async ({ request, session }) => {
  const input = await body<{ compagnieId: string; reference: boolean }>(request);
  await setCompanyListed({
    companyId: input.compagnieId,
    listed: input.reference,
    actor: { userId: session.userId, role: session.activeRole },
  });
  return { ok: true };
});
