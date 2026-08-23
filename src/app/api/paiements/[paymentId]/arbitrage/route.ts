import { authedWith, body } from "@/lib/api/handler";
import { resolveIndeterminate } from "@/lib/domain/payments";

/**
 * POST /api/paiements/[paymentId]/arbitrage — §3.2 « Un humain tranche. Le
 * système ne devine jamais. »
 */
export const POST = authedWith<{ paymentId: string }>(
  ["SUPER_ADMIN", "ADMIN_COMPAGNIE"],
  async ({ request, params, session }) => {
    const { decision, note } = await body<{ decision: "CONFIRME" | "ECHOUE"; note: string }>(
      request,
    );
    const result = await resolveIndeterminate({
      paymentId: params.paymentId,
      decision,
      note,
      actor: { userId: session.userId, role: session.activeRole },
    });
    return { paiement: result.payment, billets: result.tickets };
  },
);
