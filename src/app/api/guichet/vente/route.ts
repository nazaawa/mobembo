import { authed, body } from "@/lib/api/handler";
import { posSell, type PassengerInput } from "@/lib/domain/bookings";
import { errors } from "@/lib/core/errors";
import type { Currency } from "@/lib/core/money";

/**
 * POST /api/guichet/vente — §2.4 parcours de vente au guichet.
 *
 * Aucun montant n'est accepté du client : le prix vient de la grille tarifaire
 * du trajet (« Le guichetier ne peut pas modifier un tarif »).
 *
 * `clientOpId` rend l'appel idempotent : une vente réalisée hors-ligne puis
 * rejouée par la file de synchronisation ne produit pas un second billet.
 */
export const POST = authed(
  ["GUICHETIER"],
  async ({ request, session, ip, device }) => {
    if (!session.agencyId || !session.companyId) {
      throw errors.forbidden("Aucune agence rattachée à ce rôle.");
    }
    const input = await body<{
      tripId: string;
      sieges: string[];
      passagers: PassengerInput[];
      telephone: string;
      nom: string;
      caisseId: string;
      devise: Currency;
      clientOpId?: string;
      clientTime?: string;
    }>(request);

    const result = await posSell({
      tripId: input.tripId,
      seatNumbers: input.sieges,
      passengers: input.passagers,
      buyerPhone: input.telephone,
      buyerName: input.nom,
      cashSessionId: input.caisseId,
      currency: input.devise,
      actor: {
        userId: session.userId,
        role: session.activeRole,
        companyId: session.companyId,
        agencyId: session.agencyId,
      },
      clientOpId: input.clientOpId,
      clientTime: input.clientTime,
      deviceId: device ?? undefined,
      ip,
    });

    return { reservation: result.booking, billets: result.tickets };
  },
);
