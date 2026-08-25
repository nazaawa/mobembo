import { handler } from "@/lib/api/handler";
import { searchTrips } from "@/lib/domain/planning";
import { activeListings } from "@/lib/domain/resale";
import { errors } from "@/lib/core/errors";

/**
 * GET /api/recherche?origine=…&destination=…&date=YYYY-MM-DD
 * §2.5.2 : « Résultats — compagnie, heure, durée estimée, prix, places
 * restantes sur le quota en ligne, catégorie. »
 */
export const GET = handler(async ({ request }) => {
  const params = request.nextUrl.searchParams;
  const origin = params.get("origine");
  const destination = params.get("destination");
  const day = params.get("date");
  if (!origin || !destination || !day) {
    throw errors.invalid("Paramètres requis : origine, destination, date (YYYY-MM-DD).");
  }

  const trips = await searchTrips({ origin, destination, day });
  return {
    resultats: await Promise.all(
      trips.map(async (trip) => ({
        ...trip,
        // §2.6 : les sièges remis en vente portent un badge, au même prix.
        remisesEnVente: (await activeListings(trip.tripId)).map((offer) => ({
          listingId: offer.listing.id,
          siege: offer.seatNumber,
          prixUsd: offer.listing.price_amount,
        })),
      })),
    ),
  };
});
