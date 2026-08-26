import { authed, body } from "@/lib/api/handler";
import { initiatePayment } from "@/lib/domain/payments";
import type { PaymentProviderId } from "@/lib/domain/types";
import { getBooking } from "@/lib/domain/repo";
import { errors } from "@/lib/core/errors";

/**
 * POST /api/paiements — §3.2 « Clé d'idempotence obligatoire sur chaque
 * initiation de paiement. Un double clic ne débite jamais deux fois. »
 *
 * Le PIN Mobile Money n'apparaît nulle part : il est saisi sur le téléphone du
 * passager, dans le canal de l'opérateur (§3.3).
 */
export const POST = authed(["PASSAGER"], async ({ request, session }) => {
  const input = await body<{
    reservationId: string;
    operateur: PaymentProviderId;
    telephone: string;
    cleIdempotence: string;
  }>(request);
  const booking = await getBooking(input.reservationId);
  if (booking.buyer_phone !== session.phone) throw errors.forbidden("Cette réservation ne vous appartient pas.");

  const result = await initiatePayment({
    bookingId: input.reservationId,
    provider: input.operateur,
    payerPhone: input.telephone,
    idempotencyKey: input.cleIdempotence,
  });

  return {
    paiement: result.payment,
    verrouJusqua: result.lockedUntil,
    rejeu: result.replayed,
    // Le client interroge /statut toutes les 30 s pendant 5 min (§3.2).
    intervalleInterrogationMs: 30_000,
  };
});
