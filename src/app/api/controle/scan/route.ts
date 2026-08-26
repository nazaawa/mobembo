import { authed, body } from "@/lib/api/handler";
import { scanTicket } from "@/lib/domain/boarding";
import { assertAgencyScope, assertCompanyScope } from "@/lib/auth/session";
import { getTrip } from "@/lib/domain/repo";

/**
 * POST /api/controle/scan — scan en ligne. Le terminal l'utilise quand le
 * réseau est là ; hors-ligne il valide localement puis synchronise.
 */
export const POST = authed(
  ["CONTROLEUR"],
  async ({ request, session, device }) => {
    const { tripId, qr, clientTime } = await body<{
      tripId: string;
      qr: string;
      clientTime?: string;
    }>(request);

    const trip = await getTrip(tripId);
    assertCompanyScope(session, trip.company_id);
    if (trip.origin_agency_id) assertAgencyScope(session, trip.origin_agency_id);

    return await scanTicket({
      tripId,
      rawQr: qr,
      scannedBy: session.userId,
      deviceId: device,
      clientTime,
    });
  },
);
