import { handlerWith } from "@/lib/api/handler";
import { getDb } from "@/lib/db";
import { getTicket, tripDetail } from "@/lib/domain/repo";
import { renunciationGrid } from "@/lib/domain/cancellation";
import { checkResaleEligibility } from "@/lib/domain/resale";

export const GET = handlerWith<{ ticketId: string }>(async ({ params }) => {
  const db = getDb();
  const ticket = getTicket(params.ticketId, db);
  const seat = db
    .prepare(`SELECT seat_number FROM trip_seats WHERE id = ?`)
    .get(ticket.trip_seat_id) as { seat_number: string };

  return {
    billet: { ...ticket, siege: seat.seat_number },
    trajet: tripDetail(ticket.trip_id, db),
    // §2.9 : le gradient d'incitation, calculé à l'instant présent.
    grilleRenoncement: renunciationGrid(params.ticketId, db),
    revente: checkResaleEligibility(params.ticketId, db),
  };
});
