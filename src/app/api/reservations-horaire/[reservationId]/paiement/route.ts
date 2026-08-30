import { authedWith, body } from "@/lib/api/handler";
import { normalisePhone } from "@/lib/auth";
import { errors } from "@/lib/core/errors";
import { reservationById } from "@/lib/domain/reservations";
import { initiateReservationPayment, paymentQuote } from "@/lib/domain/reservation-payments";
import type { PaymentProviderId } from "@/lib/domain/types";

/**
 * §14.1 — paiement d'une réservation.
 *
 * Le paiement exige la session OTP du voyageur, contrairement à la réservation
 * elle-même : réserver ne coûte rien et doit rester sans friction, payer engage
 * de l'argent. Le numéro vérifié doit être celui de la réservation.
 */
export const GET = authedWith<{ reservationId: string }>(["PASSAGER"], async ({ session, params }) => {
  const reservation = await reservationById(params.reservationId);
  if (!reservation) throw errors.notFound("Réservation");
  if (reservation.passenger_phone !== session.phone) {
    throw errors.forbidden("Cette réservation appartient à un autre numéro.");
  }
  return { devis: await paymentQuote(params.reservationId) };
});

export const POST = authedWith<{ reservationId: string }>(["PASSAGER"], async ({ request, session, params }) => {
  const input = await body<{
    operateur: PaymentProviderId;
    telephone: string;
    cleIdempotence: string;
  }>(request);

  const reservation = await reservationById(params.reservationId);
  if (!reservation) throw errors.notFound("Réservation");
  if (reservation.passenger_phone !== session.phone) {
    throw errors.forbidden("Cette réservation appartient à un autre numéro.");
  }
  if (!input.cleIdempotence) {
    throw errors.invalid("Clé d'idempotence absente : un double clic débiterait deux fois.");
  }

  return initiateReservationPayment({
    reservationId: params.reservationId,
    provider: input.operateur,
    payerPhone: normalisePhone(input.telephone),
    idempotencyKey: input.cleIdempotence,
  });
});
