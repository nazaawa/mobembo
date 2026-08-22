import Link from "next/link";
import { notFound } from "next/navigation";
import { currentSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { tripDetail, getSeatMap } from "@/lib/domain/repo";
import { listTripSeats, seatAvailability } from "@/lib/domain/seats";
import { formatDateTime } from "@/lib/core/time";
import { CHANNEL_LABELS, TICKET_STATUS_LABELS, type TicketStatus } from "@/lib/domain/types";
import { Card, Badge, Stat, Empty, Money, Table, Why } from "@/components/ui";
import { Allocation, ActionsTrajet } from "./actions";

export const dynamic = "force-dynamic";

/** Fiche d'un départ : allocation, billets émis, actions du gérant. */
export default async function FicheTrajet(props: PageProps<"/backoffice/trajet/[tripId]">) {
  const { tripId } = await props.params;
  const session = await currentSession();

  let trip;
  try {
    trip = tripDetail(tripId);
  } catch {
    notFound();
  }
  if (session!.activeRole !== "SUPER_ADMIN" && trip.company_id !== session!.companyId) notFound();

  const db = getDb();
  const seatMap = getSeatMap(trip.bus.seat_map_id, db);
  const dispo = seatAvailability(tripId, db);
  const seats = listTripSeats(tripId, db);

  const billets = db
    .prepare(
      `SELECT t.id, t.ticket_code, t.status, t.passenger_name, t.passenger_phone,
              t.price_amount, t.price_currency, t.sequence_number,
              s.seat_number, b.channel, u.name AS vendeur
         FROM tickets t
         JOIN trip_seats s ON s.id = t.trip_seat_id
         JOIN bookings b ON b.id = t.booking_id
         LEFT JOIN users u ON u.id = b.sold_by_user_id
        WHERE t.trip_id = ? ORDER BY s.seat_number`,
    )
    .all(tripId) as Array<{
    id: string;
    ticket_code: string;
    status: TicketStatus;
    passenger_name: string;
    passenger_phone: string;
    price_amount: number;
    price_currency: string;
    sequence_number: number | null;
    seat_number: string;
    channel: string;
    vendeur: string | null;
  }>;

  const recette = billets
    .filter((b) => ["EMIS", "EN_REVENTE", "EMBARQUE", "EXPIRE"].includes(b.status))
    .reduce((somme, billet) => somme + billet.price_amount, 0);

  return (
    <div className="space-y-5">
      <div>
        <Link href="/backoffice/planification" className="text-sm text-accent hover:underline">
          ← Planification
        </Link>
        <h1 className="mt-1.5 text-xl font-semibold tracking-tight">
          {trip.route.origin_city} → {trip.route.destination_city}
        </h1>
        <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-texte-doux">
          <span>{formatDateTime(trip.departure_datetime)}</span>
          <Badge tone={trip.departure_mode === "HORAIRE_FIXE" ? "accent" : "attention"}>
            {trip.departure_mode === "HORAIRE_FIXE" ? "horaire fixe" : "au remplissage"}
          </Badge>
          <span>bus {trip.bus.plate_number}</span>
          <Badge tone={trip.status === "ANNULE" ? "alerte" : "neutre"}>
            {trip.status.toLowerCase()}
          </Badge>
          {trip.departed_at && <span>parti à {formatDateTime(trip.departed_at)}</span>}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Places" value={seatMap.seat_count} />
        <Stat
          label="Vendues"
          value={seats.filter((s) => ["VENDU", "EMBARQUE"].includes(s.status)).length}
          tone="succes"
        />
        <Stat label="Embarquées" value={seats.filter((s) => s.status === "EMBARQUE").length} />
        <Stat label="Recette" value={<Money amount={recette} currency="USD" />} tone="accent" />
      </div>

      <Card
        title="Allocation par canal"
        subtitle="Libérez les sièges en ligne invendus vers le guichet avant le départ."
      >
        <div className="grid gap-3 sm:grid-cols-3">
          {dispo.map((allocation) => (
            <div key={allocation.channel} className="rounded-lg border border-bordure p-3">
              <div className="text-xs font-medium text-texte-doux">
                {CHANNEL_LABELS[allocation.channel]}
              </div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">{allocation.quota}</div>
              <div className="mt-1 flex gap-3 text-xs text-texte-doux">
                <span className="text-succes">{allocation.disponibles} libres</span>
                <span>{allocation.vendus} vendus</span>
                {allocation.verrouilles > 0 && (
                  <span className="text-attention">{allocation.verrouilles} en paiement</span>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4">
          <Allocation tripId={tripId} disponibilite={dispo} />
        </div>

        <div className="mt-3">
          <Why>
            Seuls des sièges disponibles se déplacent d&apos;un canal à l&apos;autre — déplacer un
            siège vendu reviendrait à le revendre. Chaque rééquilibrage est enregistré au journal
            d&apos;audit.
          </Why>
        </div>
      </Card>

      <ActionsTrajet
        tripId={tripId}
        statut={trip.status}
        departEffectif={trip.departed_at}
        manifesteClos={trip.manifest_closed_at}
      />

      <Card title="Billets émis" subtitle={`${billets.length} billet(s)`}>
        {billets.length === 0 ? (
          <Empty>Aucun billet vendu sur ce départ.</Empty>
        ) : (
          <Table
            headers={["Siège", "Passager", "Code", "N°", "Canal", "Vendeur", "Prix", "État"]}
          >
            {billets.map((billet) => (
              <tr key={billet.id}>
                <td className="px-2 py-1.5 font-medium tabular-nums">{billet.seat_number}</td>
                <td className="px-2 py-1.5">
                  {billet.passenger_name}
                  <div className="text-[10px] text-texte-doux">{billet.passenger_phone}</div>
                </td>
                <td className="px-2 py-1.5 font-mono text-xs">{billet.ticket_code}</td>
                <td className="px-2 py-1.5 tabular-nums text-xs text-texte-doux">
                  {billet.sequence_number !== null ? `#${billet.sequence_number}` : "—"}
                </td>
                <td className="px-2 py-1.5 text-xs text-texte-doux">
                  {CHANNEL_LABELS[billet.channel as keyof typeof CHANNEL_LABELS] ?? billet.channel}
                </td>
                <td className="px-2 py-1.5 text-xs text-texte-doux">{billet.vendeur ?? "—"}</td>
                <td className="px-2 py-1.5 text-right">
                  <Money amount={billet.price_amount} currency={billet.price_currency} />
                </td>
                <td className="px-2 py-1.5">
                  <Badge
                    tone={
                      billet.status === "EMIS"
                        ? "succes"
                        : billet.status === "EMBARQUE"
                          ? "accent"
                          : billet.status === "EN_REVENTE"
                            ? "attention"
                            : "alerte"
                    }
                  >
                    {TICKET_STATUS_LABELS[billet.status]}
                  </Badge>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
