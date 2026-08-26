import { authedWith, body } from "@/lib/api/handler";
import { resolveIndeterminate } from "@/lib/domain/payments";
import { assertCompanyScope } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { errors } from "@/lib/core/errors";

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
    const ownership = await getDb()
      .prepare<{ company_id: string }>(
        `SELECT t.company_id FROM payments p
          JOIN bookings b ON b.id = p.booking_id
          JOIN trips t ON t.id = b.trip_id
         WHERE p.id = ?`,
      )
      .get(params.paymentId);
    if (!ownership) throw errors.notFound("Paiement");
    assertCompanyScope(session, ownership.company_id);
    const result = await resolveIndeterminate({
      paymentId: params.paymentId,
      decision,
      note,
      actor: { userId: session.userId, role: session.activeRole },
    });
    return { paiement: result.payment, billets: result.tickets };
  },
);
