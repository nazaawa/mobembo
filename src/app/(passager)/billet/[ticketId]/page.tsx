import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { getBooking, getTicket, tripDetail } from "@/lib/domain/repo";
import { currentSession } from "@/lib/auth/session";
import { renunciationGrid } from "@/lib/domain/cancellation";
import { checkResaleEligibility } from "@/lib/domain/resale";
import { formatDateTime } from "@/lib/core/time";
import { TICKET_STATUS_LABELS } from "@/lib/domain/types";
import { Card, Badge, Money, Why, Table } from "@/components/ui";
import { QrCode } from "@/components/qr";
import { ActionsBillet } from "./actions";
import { ConnexionPassager } from "../../mes-billets/connexion";

export const dynamic = "force-dynamic";

/** §2.5.6 Délivrance — billet QR à l'écran. */
export default async function PageBillet(props: PageProps<"/billet/[ticketId]">) {
  const { ticketId } = await props.params;
  const session = await currentSession();
  if (!session || session.activeRole !== "PASSAGER") {
    return <Card title="Accéder à ce billet" subtitle="Vérifiez d'abord votre numéro de téléphone."><ConnexionPassager /></Card>;
  }

  let ticket;
  try {
    ticket = await getTicket(ticketId);
  } catch {
    notFound();
  }

  const db = getDb();
  const booking = await getBooking(ticket.booking_id, db);
  if (ticket.passenger_phone !== session.phone && booking.buyer_phone !== session.phone) notFound();
  const trip = await tripDetail(ticket.trip_id, db);
  const seat = (await db
    .prepare<{ seat_number: string }>(`SELECT seat_number FROM trip_seats WHERE id = ?`)
    .get(ticket.trip_seat_id)) as { seat_number: string };
  const grille = await renunciationGrid(ticketId, db);
  const revente = await checkResaleEligibility(ticketId, db);

  const valide = ["EMIS", "EN_REVENTE"].includes(ticket.status);
  const tone =
    ticket.status === "EMIS"
      ? "succes"
      : ticket.status === "EN_REVENTE"
        ? "attention"
        : ticket.status === "EMBARQUE"
          ? "accent"
          : "alerte";

  return (
    <div className="space-y-5">
      <Card
        title="Votre billet"
        subtitle={`${trip.company.name} · ${trip.route.origin_city} → ${trip.route.destination_city}`}
        actions={<Badge tone={tone}>{TICKET_STATUS_LABELS[ticket.status]}</Badge>}
      >
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          <div className="text-center">
            {valide ? (
              <QrCode payload={ticket.qr_signature} />
            ) : (
              <div className="flex h-[244px] w-[244px] items-center justify-center rounded-xl border border-dashed border-alerte/50 bg-alerte-doux px-4 text-center text-sm text-alerte">
                Ce QR n&apos;est plus valable&nbsp;: {TICKET_STATUS_LABELS[ticket.status]}
              </div>
            )}
            <p className="mt-2 font-mono text-lg font-semibold tracking-wider">
              {ticket.ticket_code}
            </p>
          </div>

          <dl className="w-full space-y-2 text-sm">
            <Ligne terme="Passager" definition={ticket.passenger_name} />
            <Ligne terme="Siège" definition={<strong>{seat.seat_number}</strong>} />
            <Ligne terme="Départ" definition={formatDateTime(trip.departure_datetime)} />
            <Ligne terme="Bus" definition={`${trip.bus.plate_number} · ${trip.bus.category}`} />
            <Ligne terme="Agence de départ" definition={trip.agency?.name ?? "—"} />
            <Ligne
              terme="Prix payé"
              definition={<Money amount={ticket.price_amount} currency={ticket.price_currency} />}
            />
            {ticket.sequence_number !== null && (
              <Ligne terme="N° guichet" definition={`#${ticket.sequence_number}`} />
            )}
          </dl>
        </div>

        <div className="mt-4">
          <Why>
            Présentez ce code à l&apos;embarquement. Le contrôleur le vérifie hors connexion : il
            n&apos;a besoin ni de réseau, ni de votre téléphone allumé si vous avez le SMS.
          </Why>
        </div>
      </Card>

      {valide && (
        <Card
          title="Un empêchement ?"
          subtitle="Plus vous vous y prenez tôt, plus vous récupérez."
        >
          <Table headers={["Option", "Délai", "Récupéré", "Forme", ""]}>
            {grille.map((option) => (
              <tr key={option.action} className={option.disponible ? "" : "opacity-50"}>
                <td className="px-2 py-2 font-medium">{option.label}</td>
                <td className="px-2 py-2 text-texte-doux">{option.delai}</td>
                <td className="px-2 py-2 tabular-nums">{option.recupere}</td>
                <td className="px-2 py-2 text-texte-doux">{option.forme}</td>
                <td className="px-2 py-2 text-right">
                  {option.disponible ? (
                    <Money amount={option.montant} currency={ticket.price_currency} />
                  ) : (
                    <span className="text-[11px] text-texte-doux">{option.raison}</span>
                  )}
                </td>
              </tr>
            ))}
          </Table>

          <div className="mt-4">
            <ActionsBillet
              ticketId={ticketId}
              statut={ticket.status}
              revente={revente}
              grille={grille.map((o) => ({
                action: o.action,
                label: o.label,
                disponible: o.disponible,
                raison: o.raison,
              }))}
            />
          </div>
        </Card>
      )}

      <p className="text-center text-sm">
        <Link href="/mes-billets" className="text-accent hover:underline">
          Voir tous mes billets
        </Link>
      </p>
    </div>
  );
}

function Ligne({ terme, definition }: { terme: string; definition: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-bordure pb-1.5 last:border-0">
      <dt className="text-texte-doux">{terme}</dt>
      <dd className="text-right">{definition}</dd>
    </div>
  );
}
