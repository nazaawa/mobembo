import { authed, body } from "@/lib/api/handler";
import { normalisePhone } from "@/lib/auth";
import { errors } from "@/lib/core/errors";
import { createBooking, type PassengerInput } from "@/lib/domain/bookings";
import { activeCredits } from "@/lib/domain/cancellation";
import type { Currency } from "@/lib/core/money";

/**
 * POST /api/reservations — §2.5.4 Identification puis création de la
 * réservation. Une réservation porte plusieurs billets pour un seul paiement
 * (réservation de groupe).
 */
export const POST = authed(["PASSAGER"], async ({ request, session }) => {
  const input = await body<{
    tripId: string;
    holdId: string;
    telephone: string;
    nom: string;
    passagers: PassengerInput[];
    devise: Currency;
    avoirId?: string | null;
  }>(request);
  if (normalisePhone(input.telephone) !== session.phone) {
    throw errors.forbidden("La réservation doit utiliser le numéro vérifié par OTP.");
  }

  const { booking, dueAmount } = await createBooking({
    tripId: input.tripId,
    holdId: input.holdId,
    buyerPhone: input.telephone,
    buyerName: input.nom,
    passengers: input.passagers,
    currency: input.devise,
    useCreditId: input.avoirId ?? null,
  });

  return {
    reservation: booking,
    montantDu: dueAmount,
    avoirsDisponibles: await activeCredits(input.telephone),
  };
});
