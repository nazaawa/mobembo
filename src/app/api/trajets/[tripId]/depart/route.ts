import { authedWith } from "@/lib/api/handler";
import { markDeparted } from "@/lib/domain/boarding";

/**
 * POST — §2.9 « Le départ effectif fait foi, pas l'horaire théorique. »
 * Tant que ce marquage n'a pas eu lieu, aucun billet ne peut expirer.
 */
export const POST = authedWith<{ tripId: string }>(
  ["CONTROLEUR", "GERANT_AGENCE", "ADMIN_COMPAGNIE"],
  async ({ params, session }) =>
    markDeparted({
      tripId: params.tripId,
      actor: { userId: session.userId, role: session.activeRole, companyId: session.companyId },
    }),
);
