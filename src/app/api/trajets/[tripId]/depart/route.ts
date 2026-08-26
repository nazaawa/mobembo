import { authedWith } from "@/lib/api/handler";
import { markDeparted } from "@/lib/domain/boarding";
import { assertAgencyScope, assertCompanyScope } from "@/lib/auth/session";
import { getTrip } from "@/lib/domain/repo";

/**
 * POST — §2.9 « Le départ effectif fait foi, pas l'horaire théorique. »
 * Tant que ce marquage n'a pas eu lieu, aucun billet ne peut expirer.
 */
export const POST = authedWith<{ tripId: string }>(
  ["CONTROLEUR"],
  async ({ params, session }) => {
    const trip = await getTrip(params.tripId);
    assertCompanyScope(session, trip.company_id);
    if (trip.origin_agency_id) assertAgencyScope(session, trip.origin_agency_id);
    return markDeparted({
      tripId: params.tripId,
      actor: { userId: session.userId, role: session.activeRole, companyId: session.companyId },
    });
  },
);
