import { authedWith } from "@/lib/api/handler";
import { getDb } from "@/lib/db";
import { getBooking, tripDetail } from "@/lib/domain/repo";
import type { TicketRow, PaymentRow } from "@/lib/domain/repo";
import { errors } from "@/lib/core/errors";

export const GET = authedWith<{ bookingId: string }>(["PASSAGER"], async ({ params, session }) => {
  const db = getDb();
  const booking = await getBooking(params.bookingId, db);
  if (booking.buyer_phone !== session.phone) throw errors.forbidden("Cette réservation ne vous appartient pas.");
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
