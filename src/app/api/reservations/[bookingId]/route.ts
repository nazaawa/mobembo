import { handlerWith } from "@/lib/api/handler";
import { getDb } from "@/lib/db";
import { getBooking, tripDetail } from "@/lib/domain/repo";
import type { TicketRow, PaymentRow } from "@/lib/domain/repo";

export const GET = handlerWith<{ bookingId: string }>(async ({ params }) => {
  const db = getDb();
  const booking = await getBooking(params.bookingId, db);
  return {
    reservation: booking,
    trajet: await tripDetail(booking.trip_id, db),
    billets: await db
      .prepare<TicketRow>(`SELECT * FROM tickets WHERE booking_id = ?`)
      .all(params.bookingId),
    paiements: await db
      .prepare<PaymentRow>(`SELECT * FROM payments WHERE booking_id = ?`)
      .all(params.bookingId),
  };
});
