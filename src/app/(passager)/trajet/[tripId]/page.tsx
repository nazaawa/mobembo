import Link from "next/link";
import { notFound } from "next/navigation";
import { tripDetail, getSeatMap } from "@/lib/domain/repo";
import { listTripSeats, seatAvailability } from "@/lib/domain/seats";
import { activeListings } from "@/lib/domain/resale";
import { formatDateTime } from "@/lib/core/time";
import type { SeatMapLayout } from "@/lib/domain/types";
import { Card, Badge, Money, Why } from "@/components/ui";
import { Reservation } from "./reservation";

export const dynamic = "force-dynamic";

/** §2.5.3 Sélection du siège sur plan, puis verrouillage 7 minutes. */
export default async function PageTrajet(props: PageProps<"/trajet/[tripId]">) {
  const { tripId } = await props.params;

  let trip;
  try {
    trip = await tripDetail(tripId);
  } catch {
    notFound();
  }

  // §2.2 : un départ à remplissage n'a pas d'horaire tenu, donc pas de vente en ligne.
  if (trip.departure_mode !== "HORAIRE_FIXE") {
    return (
      <Card title="Ce départ ne se vend pas en ligne">
        <p className="text-sm">
          Ce bus part quand il est plein, sans heure annoncée. Il se vend uniquement au guichet de{" "}
          {trip.agency?.name ?? "l'agence de départ"}.
        </p>
        <div className="mt-3">
          <Why>
            Vendre en ligne une heure que l&apos;opérateur ne tient pas est la première cause de
            litige. Tant que le départ dépend du remplissage, aucun horaire n&apos;est affiché ici.
          </Why>
        </div>
        <Link href="/" className="mt-4 inline-block text-sm text-accent hover:underline">
          ← Nouvelle recherche
        </Link>
      </Card>
    );
  }

  const seatMap = await getSeatMap(trip.bus.seat_map_id);
  const layout = JSON.parse(seatMap.layout_json) as SeatMapLayout;
  const [seats, listings, disponibilites] = await Promise.all([
    listTripSeats(tripId),
    activeListings(tripId),
    seatAvailability(tripId),
  ]);
  const parSiege = new Map(listings.map((l) => [l.seatNumber, l.listing]));
  const dispo = disponibilites.find((a) => a.channel === "EN_LIGNE");
  const prix = trip.prices.find((p) => p.category === trip.bus.category) ?? trip.prices[0];

  return (
    <div className="space-y-5">
      <div>
        <Link href="/" className="text-sm text-accent hover:underline">
          ← Nouvelle recherche
        </Link>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">
          {trip.route.origin_city} → {trip.route.destination_city}
        </h1>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-texte-doux">
          <span>{trip.company.name}</span>
          <Badge tone={trip.bus.category === "VIP" ? "accent" : "neutre"}>
            {trip.bus.category}
          </Badge>
          <span>{formatDateTime(trip.departure_datetime)}</span>
          <span>· bus {trip.bus.plate_number}</span>
        </p>
        <p className="mt-1 text-sm">
          <Money amount={prix.price_usd} currency="USD" />{" "}
          <span className="text-texte-doux">
            ou <Money amount={prix.price_cdf} currency="CDF" /> — vous payez dans la devise de
            votre wallet.
          </span>
        </p>
      </div>

      <Reservation
        tripId={tripId}
        rows={seatMap.rows}
        layoutColumns={layout.columns}
        seats={seats.map((seat) => ({
          numero: seat.seat_number,
          statut: seat.status,
          canal: seat.channel,
          remisEnVente: parSiege.has(seat.seat_number),
          listingId: parSiege.get(seat.seat_number)?.id ?? null,
        }))}
        prixUsd={prix.price_usd}
        prixCdf={prix.price_cdf}
        placesRestantes={(dispo?.disponibles ?? 0) + listings.length}
        trajet={{
          origine: trip.route.origin_city,
          destination: trip.route.destination_city,
          compagnie: trip.company.name,
          depart: trip.departure_datetime,
          categorie: trip.bus.category,
          vehiculeType: trip.bus.vehicle_type,
          plaque: trip.bus.plate_number,
        }}
      />
    </div>
  );
}
