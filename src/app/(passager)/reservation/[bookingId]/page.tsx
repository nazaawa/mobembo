import Link from "next/link";
import { notFound } from "next/navigation";
import { currentSession } from "@/lib/auth/session";
import { getBooking, tripDetail } from "@/lib/domain/repo";
import { bookingPassengers } from "@/lib/domain/bookings";
import { formatDateTime } from "@/lib/core/time";
import type { Currency } from "@/lib/core/money";
import { Card, Money } from "@/components/ui";
import { ConnexionPassager } from "../../mes-billets/connexion";
import { PaiementReprise } from "./paiement";

export const dynamic = "force-dynamic";

/**
 * Reprise d'une réservation en attente de paiement, hors du tunnel initial
 * (§2.5.5) : un passager qui quitte l'écran de paiement puis revient — onglet
 * fermé, page rechargée, verrou toujours valide — doit pouvoir finir de payer
 * sans repartir de la sélection de siège.
 */
export default async function PageReservation(props: PageProps<"/reservation/[bookingId]">) {
  const { bookingId } = await props.params;
  const session = await currentSession();
  if (!session || session.activeRole !== "PASSAGER") {
    return (
      <Card title="Reprendre le paiement" subtitle="Vérifiez d'abord votre numéro de téléphone.">
        <ConnexionPassager />
      </Card>
    );
  }

  let booking;
  try {
    booking = await getBooking(bookingId);
  } catch {
    notFound();
  }
  // Comme pour un billet (§2.5.6) : une réservation qui n'appartient pas à ce
  // numéro n'existe pas, du point de vue de qui la consulte.
  if (booking.buyer_phone !== session.phone) notFound();

  if (booking.status === "CONFIRME") {
    return (
      <Card title="Réservation déjà payée">
        <p className="text-sm text-texte-doux">
          Cette réservation a déjà été réglée.{" "}
          <Link href="/mes-billets" className="text-accent hover:underline">
            Voir mes billets
          </Link>
        </p>
      </Card>
    );
  }
  if (booking.status !== "EN_ATTENTE") {
    return (
      <Card title="Réservation close">
        <p className="text-sm text-texte-doux">
          {booking.status === "EXPIRE"
            ? "Le délai de paiement a expiré et vos sièges ont été relâchés."
            : "Cette réservation a été annulée."}{" "}
          <Link href={`/trajet/${booking.trip_id}`} className="text-accent hover:underline">
            Recommencer la sélection
          </Link>
        </p>
      </Card>
    );
  }

  const trip = await tripDetail(booking.trip_id);
  const { passengers } = await bookingPassengers(bookingId);
  const montantDu = booking.total_amount - booking.credit_applied;

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <Card
        title="Finaliser le paiement"
        subtitle={`${trip.company.name} · ${trip.route.origin_city} → ${trip.route.destination_city}`}
      >
        <dl className="space-y-2 text-sm">
          <Ligne terme="Départ" definition={formatDateTime(trip.departure_datetime)} />
          <Ligne terme="Bus" definition={`${trip.bus.plate_number} · ${trip.bus.category}`} />
          <Ligne
            terme="Sièges"
            definition={passengers.map((passager) => passager.seatNumber).join(", ")}
          />
          {booking.credit_applied > 0 && (
            <Ligne
              terme="Avoir appliqué"
              definition={<Money amount={booking.credit_applied} currency={booking.currency as Currency} />}
            />
          )}
          <Ligne
            terme="Montant à payer"
            definition={
              <span className="text-lg font-bold text-navy">
                <Money amount={montantDu} currency={booking.currency as Currency} />
              </span>
            }
          />
        </dl>
      </Card>

      <PaiementReprise
        bookingId={booking.id}
        devise={booking.currency as Currency}
        telephone={session.phone}
      />
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
