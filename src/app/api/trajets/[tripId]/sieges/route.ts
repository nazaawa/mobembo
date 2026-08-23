import { handlerWith, authedWith, body } from "@/lib/api/handler";
import { listTripSeats, seatAvailability, blockSeat } from "@/lib/domain/seats";
import { activeListings } from "@/lib/domain/resale";
import { tripDetail } from "@/lib/domain/repo";

/**
 * GET /api/trajets/[tripId]/sieges — plan de sièges avec les états en temps
 * réel (§2.4.2). Les sièges des autres canaux sont renvoyés : le guichetier les
 * voit sans pouvoir les cliquer.
 */
export const GET = handlerWith<{ tripId: string }>(async ({ params }) => {
  const trip = tripDetail(params.tripId);
  const listings = activeListings(params.tripId);
  const parSiege = new Map(listings.map((l) => [l.seatNumber, l.listing]));

  return {
    trajet: {
      id: trip.id,
      compagnie: trip.company.name,
      ligne: `${trip.route.origin_city} → ${trip.route.destination_city}`,
      depart: trip.departure_datetime,
      mode: trip.departure_mode,
      statut: trip.status,
      plaque: trip.bus.plate_number,
      categorie: trip.bus.category,
      prix: trip.prices,
      agence: trip.agency?.name ?? null,
    },
    sieges: listTripSeats(params.tripId).map((seat) => ({
      numero: seat.seat_number,
      statut: seat.status,
      canal: seat.channel,
      verrouJusqua: seat.locked_until,
      remisEnVente: parSiege.has(seat.seat_number),
      listingId: parSiege.get(seat.seat_number)?.id ?? null,
    })),
    disponibilite: seatAvailability(params.tripId),
  };
});

/** PATCH — blocage/déblocage d'un siège (§2.8 BLOQUE_ADMIN). */
export const PATCH = authedWith<{ tripId: string }>(
  ["GERANT_AGENCE", "ADMIN_COMPAGNIE", "SUPER_ADMIN"],
  async ({ request, params, session }) => {
    const { seatNumber, blocked } = await body<{ seatNumber: string; blocked: boolean }>(request);
    blockSeat({
      tripId: params.tripId,
      seatNumber,
      blocked,
      actor: { userId: session.userId, role: session.activeRole, companyId: session.companyId },
    });
    return { siege: seatNumber, bloque: blocked };
  },
);
