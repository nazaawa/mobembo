import { authed, body } from "@/lib/api/handler";
import { syncScans } from "@/lib/domain/boarding";

/**
 * POST /api/controle/synchronisation — §2.7 « Synchronisation du manifeste
 * scanné au retour du réseau : liste des no-shows, taux de remplissage réel. »
 * Chaque scan est idempotent par `clientOpId`.
 */
export const POST = authed(
  ["CONTROLEUR", "GERANT_AGENCE", "ADMIN_COMPAGNIE"],
  async ({ request, session, device }) => {
    const { tripId, scans } = await body<{
      tripId: string;
      scans: Array<{ clientOpId: string; rawQr: string; clientTime: string }>;
    }>(request);

    const resultats = syncScans({
      tripId,
      deviceId: device ?? "terminal-inconnu",
      scans,
      scannedBy: session.userId,
    });
    return { resultats, synchronises: resultats.length };
  },
);
