import { authed, body } from "@/lib/api/handler";
import { errors } from "@/lib/core/errors";
import { markRefunded } from "@/lib/domain/reservation-payments";

/**
 * §16 : « Les remboursements et annulations devront respecter les règles
 * définies par l'agence et Mobembo. » Tant que ces règles ne sont pas écrites,
 * Mobembo ne décaisse rien tout seul : l'agence rembourse par son propre canal
 * puis le déclare ici, ce qui sort la ligne de sa file d'attente.
 */
export const POST = authed(["ADMIN_COMPAGNIE", "GERANT_AGENCE", "SUPER_ADMIN"], async ({ request, session }) => {
  if (!session.companyId) throw errors.invalid("Compagnie non déterminée.");
  const input = await body<{ paiementId: string }>(request);
  return {
    paiement: await markRefunded({
      paymentId: input.paiementId,
      companyId: session.companyId,
      actor: { userId: session.userId, role: session.activeRole },
    }),
  };
});
