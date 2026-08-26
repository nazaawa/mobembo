import Link from "next/link";
import { currentSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { activeCredits } from "@/lib/domain/cancellation";
import { formatDateTime } from "@/lib/core/time";
import { TICKET_STATUS_LABELS, type TicketStatus } from "@/lib/domain/types";
import { Card, Badge, Empty, Money, Table } from "@/components/ui";
import { ConnexionPassager } from "./connexion";

export const dynamic = "force-dynamic";

interface LigneBillet {
  id: string;
  ticket_code: string;
  status: TicketStatus;
  siege: string;
  origin_city: string;
  destination_city: string;
  departure_datetime: string;
  compagnie: string;
  price_amount: number;
  price_currency: string;
}

interface LigneReservationEnAttente {
  id: string;
  total_amount: number;
  credit_applied: number;
  currency: string;
  origin_city: string;
  destination_city: string;
  departure_datetime: string;
  compagnie: string;
}

export default async function MesBillets() {
  const session = await currentSession();

  if (!session || session.activeRole !== "PASSAGER") {
    return (
      <Card title="Vos billets" subtitle="Connectez-vous avec votre numéro de téléphone.">
        <ConnexionPassager />
      </Card>
    );
  }

  const billets = await getDb()
    .prepare<LigneBillet>(
      `SELECT t.id, t.ticket_code, t.status, t.price_amount, t.price_currency,
              s.seat_number AS siege, r.origin_city, r.destination_city,
              tr.departure_datetime, c.name AS compagnie
         FROM tickets t
         JOIN trip_seats s ON s.id = t.trip_seat_id
         JOIN trips tr ON tr.id = t.trip_id
         JOIN routes r ON r.id = tr.route_id
         JOIN companies c ON c.id = tr.company_id
        WHERE t.passenger_phone = ?
        ORDER BY tr.departure_datetime DESC`,
    )
    .all(session.phone);

  const reservationsEnAttente = await getDb()
    .prepare<LigneReservationEnAttente>(
      `SELECT b.id, b.total_amount, b.credit_applied, b.currency,
              r.origin_city, r.destination_city, tr.departure_datetime, c.name AS compagnie
         FROM bookings b
         JOIN trips tr ON tr.id = b.trip_id
         JOIN routes r ON r.id = tr.route_id
         JOIN companies c ON c.id = tr.company_id
        WHERE b.buyer_phone = ? AND b.status = 'EN_ATTENTE'
        ORDER BY b.created_at DESC`,
    )
    .all(session.phone);

  const avoirs = await activeCredits(session.phone);

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold tracking-tight">Mes billets</h1>

      {reservationsEnAttente.length > 0 && (
        <Card
          title="Réservations en attente de paiement"
          subtitle="Le siège reste maintenu tant que le verrou n'a pas expiré."
        >
          <ul className="space-y-2">
            {reservationsEnAttente.map((reservation) => (
              <li
                key={reservation.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-surface-alt px-3 py-2.5"
              >
                <div className="text-sm">
                  <p className="font-medium">
                    {reservation.origin_city} → {reservation.destination_city}
                  </p>
                  <p className="text-xs text-texte-doux">
                    {reservation.compagnie} · {formatDateTime(reservation.departure_datetime)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold">
                    <Money
                      amount={reservation.total_amount - reservation.credit_applied}
                      currency={reservation.currency}
                    />
                  </span>
                  <Link
                    href={`/reservation/${reservation.id}`}
                    className="inline-flex min-h-9 items-center rounded-lg bg-accent px-3 text-sm font-medium text-accent-texte transition hover:brightness-110"
                  >
                    Payer
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {avoirs.length > 0 && (
        <Card title="Vos avoirs" subtitle="Utilisables sur votre prochaine réservation.">
          <ul className="space-y-2 text-sm">
            {avoirs.map((avoir) => (
              <li
                key={avoir.id}
                className="flex items-center justify-between rounded-lg bg-surface-alt px-3 py-2"
              >
                <span>
                  <Money amount={avoir.amount} currency={avoir.currency} />
                </span>
                <span className="text-xs text-texte-doux">
                  valable jusqu&apos;au {formatDateTime(avoir.expires_at)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {billets.length === 0 ? (
        <Empty>
          Aucun billet à ce numéro.{" "}
          <Link href="/" className="text-accent hover:underline">
            Chercher un départ
          </Link>
        </Empty>
      ) : (
        <Card>
          <Table headers={["Trajet", "Départ", "Siège", "Code", "Statut", "Prix"]}>
            {billets.map((billet) => (
              <tr key={billet.id} className="hover:bg-surface-alt">
                <td className="px-2 py-2">
                  <Link href={`/billet/${billet.id}`} className="font-medium hover:text-accent">
                    {billet.origin_city} → {billet.destination_city}
                  </Link>
                  <div className="text-[11px] text-texte-doux">{billet.compagnie}</div>
                </td>
                <td className="whitespace-nowrap px-2 py-2 text-texte-doux">
                  {formatDateTime(billet.departure_datetime)}
                </td>
                <td className="px-2 py-2 tabular-nums">{billet.siege}</td>
                <td className="px-2 py-2 font-mono text-xs">{billet.ticket_code}</td>
                <td className="px-2 py-2">
                  <Badge
                    tone={
                      billet.status === "EMIS"
                        ? "succes"
                        : billet.status === "EN_REVENTE"
                          ? "attention"
                          : billet.status === "EMBARQUE"
                            ? "accent"
                            : "alerte"
                    }
                  >
                    {TICKET_STATUS_LABELS[billet.status]}
                  </Badge>
                </td>
                <td className="px-2 py-2 text-right">
                  <Money amount={billet.price_amount} currency={billet.price_currency} />
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
    </div>
  );
}
