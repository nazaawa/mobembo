import { authedWith, body } from "@/lib/api/handler";
import { rebalanceChannel, seatAvailability } from "@/lib/domain/seats";
import { assertCompanyScope } from "@/lib/auth/session";
import { getTrip } from "@/lib/domain/repo";
import type { Channel } from "@/lib/domain/types";

/**
 * POST /api/trajets/[tripId]/allocation — §2.3 « Le gérant rééquilibre
 * l'allocation à tout moment. » Chaque rééquilibrage est tracé.
 */
export const POST = authedWith<{ tripId: string }>(
  ["GERANT_AGENCE", "ADMIN_COMPAGNIE", "SUPER_ADMIN"],
  async ({ request, params, session, ip, device }) => {
    const { from, to, count } = await body<{ from: Channel; to: Channel; count: number }>(request);
    assertCompanyScope(session, getTrip(params.tripId).company_id);

    const result = rebalanceChannel({
      tripId: params.tripId,
      from,
      to,
      count,
      actor: { userId: session.userId, role: session.activeRole, companyId: session.companyId },
      ip,
      device,
    });
    return { deplaces: result.moved, disponibilite: seatAvailability(params.tripId) };
  },
);
