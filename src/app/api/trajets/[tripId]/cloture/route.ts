import { authedWith } from "@/lib/api/handler";
import { closeManifest } from "@/lib/domain/boarding";
import { assertAgencyScope, assertCompanyScope } from "@/lib/auth/session";
import { getTrip } from "@/lib/domain/repo";

/**
 * POST — clôture manuelle du manifeste. Les billets non scannés deviennent
 * EXPIRE (no-show), et le taux de remplissage réel est figé (§2.7, §5.1).
 */
export const POST = authedWith<{ tripId: string }>(
  ["CONTROLEUR"],
  async ({ params, session }) => {
    const trip = await getTrip(params.tripId);
    assertCompanyScope(session, trip.company_id);
    if (trip.origin_agency_id) assertAgencyScope(session, trip.origin_agency_id);
    return closeManifest({
      tripId: params.tripId,
      actor: { userId: session.userId, role: session.activeRole, companyId: session.companyId },
    });
  },
);
