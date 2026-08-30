import { authedWith } from "@/lib/api/handler";
import { errors } from "@/lib/core/errors";
import {
  getSchedulePayment,
  pollReservationPayment,
  ticketOfReservation,
} from "@/lib/domain/reservation-payments";
import { reservationById } from "@/lib/domain/reservations";

/**
 * §3.2 : polling de secours quand aucun webhook n'arrive. L'écran de paiement
 * l'appelle toutes les quelques secondes ; passé cinq minutes sans réponse de
 * l'opérateur, le paiement devient INDETERMINE et un humain tranche.
 */
export const POST = authedWith<{ paymentId: string }>(["PASSAGER"], async ({ session, params }) => {
  const avant = await getSchedulePayment(params.paymentId);
  if (!avant) throw errors.notFound("Paiement");
  const reservation = await reservationById(avant.reservation_id);
  if (!reservation || reservation.passenger_phone !== session.phone) {
    throw errors.forbidden("Ce paiement appartient à un autre numéro.");
  }

  const payment = await pollReservationPayment(params.paymentId);
  return { paiement: payment, billet: await ticketOfReservation(payment.reservation_id) };
});
