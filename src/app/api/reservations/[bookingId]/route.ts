import { handlerWith } from "@/lib/api/handler";
import { getDb } from "@/lib/db";
import { getBooking, tripDetail } from "@/lib/domain/repo";
import type { TicketRow, PaymentRow } from "@/lib/domain/repo";

export const GET = handlerWith<{ bookingId: string }>(async ({ params }) => {
  const db = getDb();
  const booking = getBooking(params.bookingId, db);
  return {
    reservation: booking,
    trajet: tripDetail(booking.trip_id, db),
    billets: db
      .prepare(`SELECT * FROM tickets WHERE booking_id = ?`)
      .all(params.bookingId) as TicketRow[],
    paiements: db
      .prepare(`SELECT * FROM payments WHERE booking_id = ?`)
      .all(params.bookingId) as PaymentRow[],
  };
});
