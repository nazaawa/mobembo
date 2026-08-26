import { authedWith } from "@/lib/api/handler";
import { pollPayment } from "@/lib/domain/payments";
import { getDb } from "@/lib/db";
import type { TicketRow } from "@/lib/domain/repo";
import { errors } from "@/lib/core/errors";

/**
 * GET /api/paiements/[paymentId]/statut — polling de secours (§3.2).
 * Chaque appel interroge réellement l'opérateur ; après 5 minutes sans réponse
 * ferme, le paiement bascule en INDETERMINE et un ticket support est ouvert.
 */
export const GET = authedWith<{ paymentId: string }>(["PASSAGER"], async ({ params, session }) => {
  const ownership = await getDb()
    .prepare<{ buyer_phone: string }>(`SELECT b.buyer_phone FROM payments p JOIN bookings b ON b.id = p.booking_id WHERE p.id = ?`)
    .get(params.paymentId);
  if (!ownership) throw errors.notFound("Paiement");
  if (ownership.buyer_phone !== session.phone) throw errors.forbidden("Ce paiement ne vous appartient pas.");
  const payment = await pollPayment(params.paymentId);
  const billets =
    payment.status === "CONFIRME"
      ? await getDb()
          .prepare<TicketRow>(`SELECT * FROM tickets WHERE booking_id = ?`)
          .all(payment.booking_id)
      : [];
  return { paiement: payment, billets };
});
