import { handlerWith } from "@/lib/api/handler";
import { getDb } from "@/lib/db";
import { getTicket, tripDetail } from "@/lib/domain/repo";
import { renunciationGrid } from "@/lib/domain/cancellation";
import { checkResaleEligibility } from "@/lib/domain/resale";

export const GET = handlerWith<{ ticketId: string }>(async ({ params }) => {
  const db = getDb();
  const ticket = await getTicket(params.ticketId, db);
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
