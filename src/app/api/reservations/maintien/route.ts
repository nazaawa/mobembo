import { handler, body } from "@/lib/api/handler";
import { holdSeats, releaseHold } from "@/lib/domain/bookings";
import { newId } from "@/lib/core/ids";

/**
 * POST /api/reservations/maintien — §2.5.3 « Sélection du siège sur plan, puis
 * verrouillage 7 minutes. » Le maintien précède l'identification : il est posé
 * sous un identifiant anonyme que le client conserve.
 */
export const POST = handler(async ({ request, session }) => {
  const input = await body<{ tripId: string; sieges: string[]; holdId?: string }>(request);
  const holdId = input.holdId ?? newId("hold");
  const result = await holdSeats({
    tripId: input.tripId,
    seatNumbers: input.sieges,
    holdId,
    phone: session?.phone ?? null,
  });
  return { holdId: result.holdId, verrouJusqua: result.lockedUntil };
});

/** DELETE — le passager renonce : les sièges retournent immédiatement au stock. */
export const DELETE = handler(async ({ request }) => {
  const { tripId, holdId } = await body<{ tripId: string; holdId: string }>(request);
  return { liberes: await releaseHold(tripId, holdId) };
});
