import { authedWith } from "@/lib/api/handler";
import { getDb } from "@/lib/db";
import { getBooking, getTicket, tripDetail } from "@/lib/domain/repo";
import { renunciationGrid } from "@/lib/domain/cancellation";
import { checkResaleEligibility } from "@/lib/domain/resale";
import { errors } from "@/lib/core/errors";

export const GET = authedWith<{ ticketId: string }>(["PASSAGER"], async ({ params, session }) => {
  const db = getDb();
  const ticket = await getTicket(params.ticketId, db);
  const booking = await getBooking(ticket.booking_id, db);
  if (ticket.passenger_phone !== session.phone && booking.buyer_phone !== session.phone) {
    throw errors.forbidden("Ce billet ne vous appartient pas.");
  }
  const seat = (await db
    .prepare<{ seat_number: string }>(`SELECT seat_number FROM trip_seats WHERE id = ?`)
    .get(ticket.trip_seat_id)) as { seat_number: string };

  return {
    billet: { ...ticket, siege: seat.seat_number },
    trajet: await tripDetail(ticket.trip_id, db),
    // §2.9 : le gradient d'incitation, calculé à l'instant présent.
    grilleRenoncement: await renunciationGrid(params.ticketId, db),
    revente: await checkResaleEligibility(params.ticketId, db),
  };
});
