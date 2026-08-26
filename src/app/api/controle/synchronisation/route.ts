import { authed, body } from "@/lib/api/handler";
import { syncScans } from "@/lib/domain/boarding";
import { assertAgencyScope, assertCompanyScope } from "@/lib/auth/session";
import { getTrip } from "@/lib/domain/repo";

/**
 * POST /api/controle/synchronisation — §2.7 « Synchronisation du manifeste
 * scanné au retour du réseau : liste des no-shows, taux de remplissage réel. »
 * Chaque scan est idempotent par `clientOpId`.
 */
export const POST = authed(
  ["CONTROLEUR"],
  async ({ request, session, device }) => {
    const { tripId, scans } = await body<{
      tripId: string;
      scans: Array<{ clientOpId: string; rawQr: string; clientTime: string }>;
    }>(request);

    const trip = await getTrip(tripId);
    assertCompanyScope(session, trip.company_id);
    if (trip.origin_agency_id) assertAgencyScope(session, trip.origin_agency_id);

    const resultats = await syncScans({
      tripId,
      deviceId: device ?? "terminal-inconnu",
      scans,
      scannedBy: session.userId,
    });
    return { resultats, synchronises: resultats.length };
  },
);
