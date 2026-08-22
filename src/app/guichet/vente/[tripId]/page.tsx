import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentSession } from "@/lib/auth/session";
import { openSessionFor } from "@/lib/domain/cash";
import { tripDetail, getSeatMap } from "@/lib/domain/repo";
import { listTripSeats, seatAvailability } from "@/lib/domain/seats";
import { formatDateTime } from "@/lib/core/time";
import type { SeatMapLayout } from "@/lib/domain/types";
import { Card, Badge, Empty } from "@/components/ui";
import { TerminalVente } from "./terminal";

export const dynamic = "force-dynamic";

/** §2.4 Parcours de vente au guichet. */
export default async function PageVente(props: PageProps<"/guichet/vente/[tripId]">) {
  const { tripId } = await props.params;
  const session = await currentSession();
  if (!session || !["GUICHETIER", "GERANT_AGENCE"].includes(session.activeRole)) {
    redirect("/guichet/connexion");
  }
  if (!session.agencyId) {
    return <Empty>Aucune agence rattachée à ce rôle.</Empty>;
  }

  const caisse = openSessionFor(session.userId, session.agencyId);
  if (!caisse) {
    return (
      <Card title="Caisse fermée">
        <p className="text-sm">
          Aucune session de caisse ouverte. La vente est impossible tant que la caisse ne
          l&apos;est pas.
        </p>
        <Link href="/guichet" className="mt-3 inline-block text-sm text-accent hover:underline">
          ← Ouvrir la caisse
        </Link>
      </Card>
    );
  }

  let trip;
  try {
    trip = tripDetail(tripId);
  } catch {
    notFound();
  }
  if (trip.company_id !== session.companyId) notFound();

  const seatMap = getSeatMap(trip.bus.seat_map_id);
  const layout = JSON.parse(seatMap.layout_json) as SeatMapLayout;
  const seats = listTripSeats(tripId);
  const dispo = seatAvailability(tripId);

  const prix = trip.prices.find((p) => p.category === trip.bus.category) ?? trip.prices[0];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/guichet" className="text-sm text-accent hover:underline">
            ← Départs du jour
          </Link>
          <h1 className="mt-1.5 text-xl font-semibold tracking-tight">
            {trip.route.origin_city} → {trip.route.destination_city}
          </h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-texte-doux">
            <span>
              {trip.departure_mode === "HORAIRE_FIXE"
                ? formatDateTime(trip.departure_datetime)
                : "Départ au remplissage"}
            </span>
            <Badge tone={trip.bus.category === "VIP" ? "accent" : "neutre"}>
              {trip.bus.category}
            </Badge>
            <span>bus {trip.bus.plate_number}</span>
          </p>
        </div>
      </div>

      <TerminalVente
        tripId={tripId}
        caisseId={caisse.id}
        deviseCaisse={caisse.currency as "USD" | "CDF"}
        rows={seatMap.rows}
        layoutColumns={layout.columns}
        seats={seats.map((seat) => ({
          numero: seat.seat_number,
          statut: seat.status,
          canal: seat.channel,
        }))}
        prixUsd={prix.price_usd}
        prixCdf={prix.price_cdf}
        disponibilite={dispo}
        trajet={{
          ligne: `${trip.route.origin_city} → ${trip.route.destination_city}`,
          depart: trip.departure_datetime,
          plaque: trip.bus.plate_number,
          categorie: trip.bus.category,
        }}
      />
    </div>
  );
}
