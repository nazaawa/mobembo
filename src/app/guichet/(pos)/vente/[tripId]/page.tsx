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
  if (!session || session.activeRole !== "GUICHETIER") {
    redirect("/guichet/connexion");
  }
  if (!session.agencyId) {
    return <Empty>Aucune agence rattachée à ce rôle.</Empty>;
  }

  const caisse = await openSessionFor(session.userId, session.agencyId);
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
    trip = await tripDetail(tripId);
  } catch {
    notFound();
  }
  if (trip.company_id !== session.companyId || trip.origin_agency_id !== session.agencyId) notFound();

  const seatMap = await getSeatMap(trip.bus.seat_map_id);
  const layout = JSON.parse(seatMap.layout_json) as SeatMapLayout;
  const seats = await listTripSeats(tripId);
  const dispo = await seatAvailability(tripId);

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

      <nav aria-label="Étapes de la vente" className="overflow-x-auto rounded-[12px] border border-bordure bg-surface px-4 py-3">
        <ol className="flex min-w-[34rem] items-center text-xs font-semibold">
          {["Départ", "Sièges", "Encaissement", "Reçu"].map((label, index) => (
            <li key={label} className="flex flex-1 items-center last:flex-none">
              <span className={`flex h-7 w-7 items-center justify-center rounded-full ${index === 0 ? "bg-succes text-white" : index === 1 ? "bg-accent text-white" : "border border-bordure text-texte-doux"}`}>{index === 0 ? "✓" : index + 1}</span>
              <span className={`ml-2 ${index === 1 ? "text-navy" : "text-texte-doux"}`}>{label}</span>
              {index < 3 && <span className={`mx-3 h-px flex-1 ${index === 0 ? "bg-succes" : "bg-bordure"}`} aria-hidden />}
            </li>
          ))}
        </ol>
      </nav>

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
