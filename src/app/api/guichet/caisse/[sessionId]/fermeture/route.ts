import { authedWith, body } from "@/lib/api/handler";
import { closeCashSession } from "@/lib/domain/cash";

/**
 * POST — §2.4 fermeture : « l'agent saisit le montant physiquement compté, le
 * système calcule l'écart. » Une session ne se ferme pas deux fois.
 */
export const POST = authedWith<{ sessionId: string }>(
  ["GUICHETIER", "GERANT_AGENCE"],
  async ({ request, params, session, ip, device }) => {
    const { montantCompte } = await body<{ montantCompte: number }>(request);
    const result = closeCashSession({
      sessionId: params.sessionId,
      countedAmount: montantCompte,
      actor: { userId: session.userId, role: session.activeRole },
      ip,
      device,
    });
    return {
      session: result.session,
      attendu: result.attendu,
      compte: montantCompte,
      ecart: result.variance,
      ventes: result.ventes,
      remboursements: result.remboursements,
      nbBillets: result.nbBillets,
      mouvements: result.mouvements,
    };
  },
);
