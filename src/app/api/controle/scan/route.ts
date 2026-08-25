import { authed, body } from "@/lib/api/handler";
import { scanTicket } from "@/lib/domain/boarding";

/**
 * POST /api/controle/scan — scan en ligne. Le terminal l'utilise quand le
 * réseau est là ; hors-ligne il valide localement puis synchronise.
 */
export const POST = authed(
  ["CONTROLEUR", "GERANT_AGENCE", "ADMIN_COMPAGNIE"],
  async ({ request, session, device }) => {
    const { tripId, qr, clientTime } = await body<{
      tripId: string;
      qr: string;
      clientTime?: string;
    }>(request);

    return await scanTicket({
      tripId,
      rawQr: qr,
      scannedBy: session.userId,
      deviceId: device,
      clientTime,
    });
  },
);
