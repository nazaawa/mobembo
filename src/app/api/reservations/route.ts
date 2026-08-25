import { handler, body } from "@/lib/api/handler";
import { createBooking, type PassengerInput } from "@/lib/domain/bookings";
import { activeCredits } from "@/lib/domain/cancellation";
import type { Currency } from "@/lib/core/money";

/**
 * POST /api/reservations — §2.5.4 Identification puis création de la
 * réservation. Une réservation porte plusieurs billets pour un seul paiement
 * (réservation de groupe).
 */
export const POST = handler(async ({ request }) => {
  const input = await body<{
    tripId: string;
    holdId: string;
    telephone: string;
    nom: string;
    passagers: PassengerInput[];
    devise: Currency;
    avoirId?: string | null;
  }>(request);

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
