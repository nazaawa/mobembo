import { authedWith } from "@/lib/api/handler";
import { closeManifest } from "@/lib/domain/boarding";

/**
 * POST — clôture manuelle du manifeste. Les billets non scannés deviennent
 * EXPIRE (no-show), et le taux de remplissage réel est figé (§2.7, §5.1).
 */
export const POST = authedWith<{ tripId: string }>(
  ["CONTROLEUR", "GERANT_AGENCE", "ADMIN_COMPAGNIE"],
  async ({ params, session }) =>
    closeManifest({
      tripId: params.tripId,
      actor: { userId: session.userId, role: session.activeRole, companyId: session.companyId },
    }),
);
