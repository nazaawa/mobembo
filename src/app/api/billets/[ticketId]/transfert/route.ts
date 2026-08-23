import { authedWith, body } from "@/lib/api/handler";
import { transferTicket } from "@/lib/domain/resale";

/**
 * POST — §2.6 Transfert à un proche : gratuit, aucun décaissement, jusqu'à 1 h
 * avant le départ.
 */
export const POST = authedWith<{ ticketId: string }>(
  ["PASSAGER"],
  async ({ request, params, session }) => {
    const { nom, telephone } = await body<{ nom: string; telephone: string }>(request);
    const result = transferTicket({
      ticketId: params.ticketId,
      actorPhone: session.phone,
      beneficiaryName: nom,
      beneficiaryPhone: telephone,
    });
    return { ancien: result.ancien, nouveau: result.nouveau };
  },
);
