import { handler } from "@/lib/api/handler";
import { searchOffers } from "@/lib/domain/offers";
import { recordSearch } from "@/lib/domain/reservations";
import { activeListings } from "@/lib/domain/resale";
import { errors } from "@/lib/core/errors";

/**
 * GET /api/recherche?origine=…&destination=…&date=YYYY-MM-DD
 *
 * Renvoie les deux niveaux d'offre dans une seule liste : les trajets vendus
 * en ligne (siège, paiement, billet) et les horaires simplement publiés par
 * une agence (§4.3). `bookingMode` dit lequel des deux, et c'est la seule
 * chose qu'un client doit regarder avant de proposer une action.
 */
export const GET = handler(async ({ request }) => {
  const params = request.nextUrl.searchParams;
  const origin = params.get("origine");
  const destination = params.get("destination");
  const day = params.get("date");
  if (!origin || !destination || !day) {
    throw errors.invalid("Paramètres requis : origine, destination, date (YYYY-MM-DD).");
  }

  const offers = await searchOffers({ origin, destination, day });
  await recordSearch({ origin, destination, day, results: offers.length });

  return {
    resultats: await Promise.all(
      offers.map(async (offer) =>
        offer.kind === "TRAJET"
          ? {
              ...offer,
              // §2.6 : les sièges remis en vente portent un badge, au même prix.
              remisesEnVente: (await activeListings(offer.id)).map((listing) => ({
                listingId: listing.listing.id,
                siege: listing.seatNumber,
                prixUsd: listing.listing.price_amount,
              })),
            }
          : offer,
      ),
    ),
  };
});
