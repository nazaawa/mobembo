import { authed } from "@/lib/api/handler";
import { getDb } from "@/lib/db";
import { activeCredits } from "@/lib/domain/cancellation";

/** GET /api/billets/mes-billets — billets et avoirs du passager connecté. */
export const GET = authed(["PASSAGER"], async ({ session }) => {
  const billets = getDb()
    .prepare(
      `SELECT t.*, s.seat_number AS siege, r.origin_city, r.destination_city,
              tr.departure_datetime, tr.status AS trajet_statut, c.name AS compagnie
         FROM tickets t
         JOIN trip_seats s ON s.id = t.trip_seat_id
         JOIN trips tr ON tr.id = t.trip_id
         JOIN routes r ON r.id = tr.route_id
         JOIN companies c ON c.id = tr.company_id
        WHERE t.passenger_phone = ?
        ORDER BY tr.departure_datetime DESC`,
    )
    .all(session.phone);
  return { billets, avoirs: activeCredits(session.phone) };
});
