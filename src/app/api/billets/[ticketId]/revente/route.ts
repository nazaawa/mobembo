import { authedWith } from "@/lib/api/handler";
import { listForResale, withdrawResale } from "@/lib/domain/resale";

/** POST — §2.6 étape 1 : le vendeur active « remettre en vente ». */
export const POST = authedWith<{ ticketId: string }>(["PASSAGER"], async ({ params, session }) => {
  const listing = listForResale({ ticketId: params.ticketId, actorPhone: session.phone });
  return { annonce: listing };
});

/** DELETE — retrait volontaire : le billet redevient EMIS. */
export const DELETE = authedWith<{ ticketId: string }>(["PASSAGER"], async ({ params, session }) => {
  return { billet: withdrawResale(params.ticketId, session.phone) };
});
