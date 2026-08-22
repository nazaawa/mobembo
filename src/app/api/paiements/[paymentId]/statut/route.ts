import { handlerWith } from "@/lib/api/handler";
import { pollPayment } from "@/lib/domain/payments";
import { getDb } from "@/lib/db";
import type { TicketRow } from "@/lib/domain/repo";

/**
 * GET /api/paiements/[paymentId]/statut — polling de secours (§3.2).
 * Chaque appel interroge réellement l'opérateur ; après 5 minutes sans réponse
 * ferme, le paiement bascule en INDETERMINE et un ticket support est ouvert.
 */
export const GET = handlerWith<{ paymentId: string }>(async ({ params }) => {
  const payment = await pollPayment(params.paymentId);
  const billets =
    payment.status === "CONFIRME"
      ? (getDb()
          .prepare(`SELECT * FROM tickets WHERE booking_id = ?`)
          .all(payment.booking_id) as TicketRow[])
      : [];
  return { paiement: payment, billets };
});
