import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentSession } from "@/lib/auth/session";
import { reservationById } from "@/lib/domain/reservations";
import { paymentQuote, ticketOfReservation } from "@/lib/domain/reservation-payments";
import { formatDay, formatTime } from "@/lib/core/time";
import { newId } from "@/lib/core/ids";
import { Card } from "@/components/ui";
import { ContactAgence } from "@/components/offre";
import { ConnexionPassager } from "../../mes-billets/connexion";
import { FormulairePaiement } from "./formulaire";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Payer ma réservation — Mobembo" };

/**
 * Phase 3 §14.1 — « Après réservation, le voyageur choisit un moyen de
 * paiement. »
 *
 * L'écran exige la session OTP, contrairement à la réservation : réserver ne
 * coûte rien et doit rester sans friction, payer engage de l'argent et lie le
 * billet à un numéro vérifié — celui qui le retrouvera dans « Mes billets ».
 */
export default async function PaiementReservation(props: PageProps<"/paiement/[reservationId]">) {
  const { reservationId } = await props.params;
  const session = await currentSession();

  if (!session || session.activeRole !== "PASSAGER") {
    return (
      <div className="mx-auto max-w-lg">
        <h1 className="font-heading text-3xl font-bold tracking-[-0.02em] text-navy">
          Payer ma réservation
        </h1>
        <p className="mt-3 text-base leading-7 text-texte-doux">
          Entrez le numéro utilisé pour réserver. Un code vous est envoyé par SMS — c’est lui qui
          rattachera votre billet à votre téléphone.
        </p>
        <div className="mt-6 rounded-[14px] border border-bordure bg-surface p-5">
          <ConnexionPassager />
        </div>
      </div>
    );
  }

  const reservation = await reservationById(reservationId);
  if (!reservation) notFound();
  if (reservation.passenger_phone !== session.phone) {
    return (
      <Card title="Réservation d’un autre numéro">
        <p className="text-sm leading-6 text-texte-doux">
          Cette réservation a été créée avec un autre téléphone. Connectez-vous avec ce numéro pour
          la payer.
        </p>
      </Card>
    );
  }

  // Déjà payée : le voyageur cherche son billet, pas un formulaire.
  const billet = await ticketOfReservation(reservationId);
  if (billet) redirect(`/billet-reservation/${billet.id}`);

  const devis = await paymentQuote(reservationId);

  return (
    <div className="mx-auto max-w-2xl pb-4">
      <nav aria-label="Fil d’Ariane" className="mb-6 text-sm text-texte-doux">
        <Link href="/mes-reservations" className="font-medium hover:text-accent">
          Mes réservations
        </Link>
        <span className="mx-2" aria-hidden>›</span>
        <span className="text-navy">Paiement</span>
      </nav>

      <h1 className="font-heading text-3xl font-bold tracking-[-0.02em] text-navy sm:text-4xl">
        {reservation.origin_city} <span className="text-accent">→</span> {reservation.destination_city}
      </h1>
      <p className="mt-2 text-sm text-texte-doux">
        {reservation.compagnie} · {formatDay(reservation.travel_date)} · départ{" "}
        <span className="font-semibold tabular-nums text-navy">
          {formatTime(reservation.departure_at)}
        </span>
      </p>

      {devis.payable ? (
        <FormulairePaiement
          reservationId={reservationId}
          reference={reservation.reference}
          compagnie={reservation.compagnie}
          devis={{
            prixUnitaire: devis.prixUnitaire,
            places: devis.places,
            sousTotal: devis.sousTotal,
            frais: devis.frais,
            total: devis.total,
            devise: devis.devise,
          }}
          telephone={session.phone}
          cleIdempotence={newId(`spk-${reservationId}`)}
        />
      ) : (
        <div className="mt-8 rounded-[14px] border border-bordure bg-surface p-5">
          <h2 className="font-heading text-xl font-bold text-navy">Paiement en ligne indisponible</h2>
          <p className="mt-2 text-sm leading-6 text-texte-doux">{devis.motifNonPayable}</p>
          <p className="mt-3 text-sm leading-6 text-texte-doux">
            Votre place reste réservée sous la référence{" "}
            <span className="font-mono font-bold text-navy">{reservation.reference}</span>.
          </p>
          <div className="mt-5">
            <ContactAgence
              telephone={reservation.company_phone}
              whatsapp={reservation.company_whatsapp}
              messageWhatsapp={`Bonjour ${reservation.compagnie}, réservation Mobembo ${reservation.reference}.`}
            />
          </div>
        </div>
      )}
    </div>
  );
}
