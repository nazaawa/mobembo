import { authedWith, body } from "@/lib/api/handler";
import { renounceForCredit, renunciationGrid } from "@/lib/domain/cancellation";

/**
 * POST — §2.9 report de date (100 % en avoir) ou annulation tardive (50 %).
 * L'avoir plutôt que l'espèce : aucune trésorerie ne sort de la compagnie.
 */
export const POST = authedWith<{ ticketId: string }>(
  ["PASSAGER"],
  async ({ request, params, session }) => {
    const { action } = await body<{ action: "REPORT" | "ANNULATION_TARDIVE" }>(request);
    const result = await renounceForCredit({
      ticketId: params.ticketId,
      actorPhone: session.phone,
      action,
    });
    return {
      billet: result.ticket,
      avoir: result.credit,
      grille: await renunciationGrid(params.ticketId),
    };
  },
);
