import type { Metadata } from "next";
import Link from "next/link";
import { currentSession } from "@/lib/auth/session";
import {
  passengerReservations,
  settleFinishedReservations,
  type ReservationView,
} from "@/lib/domain/reservations";
import { formatDay, formatTime } from "@/lib/core/time";
import { formatMoney } from "@/lib/core/money";
import { companyAccess, hasModule } from "@/lib/domain/access";
import { ContactAgence, MiseAJour } from "@/components/offre";
import { ConnexionPassager } from "../mes-billets/connexion";
import { AnnulerReservation } from "./annuler";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mes réservations — Mobembo",
};

/**
 * Phase 2 §10.4 — « Mes réservations ».
 *
 * L'espace se protège par OTP sur le numéro utilisé lors de la réservation :
 * c'est la seule identité que la phase 2 possède, et elle suffit — les
 * réservations d'un numéro sont exactement celles que ce numéro a créées.
 */
export default async function MesReservations() {
  const session = await currentSession();

  if (!session || session.activeRole !== "PASSAGER") {
    return (
      <div className="mx-auto max-w-lg">
        <h1 className="font-heading text-3xl font-bold tracking-[-0.02em] text-navy">
          Mes réservations
        </h1>
        <p className="mt-3 text-base leading-7 text-texte-doux">
          Entrez le numéro que vous avez utilisé pour réserver. Un code vous est envoyé par SMS.
        </p>
        <div className="mt-6 rounded-[14px] border border-bordure bg-surface p-5">
          <ConnexionPassager />
        </div>
      </div>
    );
  }

  await settleFinishedReservations();
  const toutes = await passengerReservations(session.phone);

  // Quelles agences acceptent le paiement en ligne (§29 : la phase activée
  // décide de ce qui s'affiche). Une seule lecture pour toute la page.
  const paiementOuvert = new Set<string>();
  for (const companyId of new Set(toutes.map((reservation) => reservation.company_id))) {
    const acces = await companyAccess(companyId);
    if (hasModule(acces, "PAIEMENT")) paiementOuvert.add(companyId);
  }

  const aVenir = toutes.filter((reservation) => reservation.status === "CONFIRMEE");
  const annulees = toutes.filter((reservation) => reservation.status === "ANNULEE");
  const passees = toutes.filter((reservation) => reservation.status === "TERMINEE");

  return (
    <div className="pb-4">
      <header className="border-b border-bordure pb-7">
        <h1 className="font-heading text-3xl font-bold tracking-[-0.02em] text-navy sm:text-4xl">
          Mes réservations
        </h1>
        <p className="mt-2 text-sm text-texte-doux">
          Réservations créées avec le {session.phone}.{" "}
          <Link href="/mes-billets" className="font-semibold text-accent hover:underline">
            Vos billets payés en ligne sont ici
          </Link>
          .
        </p>
      </header>

      {toutes.length === 0 ? (
        <div className="mt-8 rounded-[14px] border border-dashed border-bordure bg-surface px-6 py-12 text-center">
          <h2 className="font-heading text-xl font-bold text-navy">Aucune réservation</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-texte-doux">
            Les places que vous réservez auprès des agences apparaîtront ici, avec leur référence.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-[10px] bg-accent px-5 text-sm font-bold text-white transition hover:bg-accent-profond"
          >
            Chercher un départ <span aria-hidden>→</span>
          </Link>
        </div>
      ) : (
        <div className="mt-8 space-y-10">
          <Groupe titre="À venir" reservations={aVenir} paiementOuvert={paiementOuvert} annulable />
          <Groupe titre="Voyages passés" reservations={passees} paiementOuvert={paiementOuvert} />
          <Groupe titre="Annulées" reservations={annulees} paiementOuvert={paiementOuvert} />
        </div>
      )}
    </div>
  );
}

function Groupe({
  titre,
  reservations,
  paiementOuvert,
  annulable = false,
}: {
  titre: string;
  reservations: ReservationView[];
  /** Agences dont la phase 3 est ouverte : elles seules affichent « Payer ». */
  paiementOuvert: Set<string>;
  annulable?: boolean;
}) {
  if (reservations.length === 0) return null;

  return (
    <section>
      <h2 className="font-heading text-xl font-bold tracking-[-0.01em] text-navy">
        {titre}
        <span className="ml-2 text-sm font-semibold text-texte-doux">{reservations.length}</span>
      </h2>
      <ul className="mt-3 space-y-3">
        {reservations.map((reservation) => (
          <li
            key={reservation.id}
            className={`overflow-hidden rounded-[14px] border bg-surface ${
              reservation.status === "CONFIRMEE" ? "border-bordure" : "border-bordure opacity-80"
            }`}
          >
            <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/agences/${reservation.company_slug ?? reservation.company_id}`}
                    className="text-sm font-semibold text-navy hover:text-accent"
                  >
                    {reservation.compagnie}
                  </Link>
                  {reservation.status === "CONFIRMEE" && (
                    <span className="rounded-md border border-succes/30 bg-succes-doux px-2 py-0.5 text-[11px] font-semibold text-succes">
                      Confirmée
                    </span>
                  )}
                  {reservation.status === "ANNULEE" && (
                    <span className="rounded-md border border-alerte/30 bg-alerte-doux px-2 py-0.5 text-[11px] font-semibold text-alerte">
                      Annulée{reservation.cancelled_by === "AGENCE" ? " par l’agence" : ""}
                    </span>
                  )}
                  {reservation.payment_status === "PAYEE" && (
                    <span className="rounded-md border border-succes/30 bg-succes-doux px-2 py-0.5 text-[11px] font-semibold text-succes">
                      Payée en ligne
                    </span>
                  )}
                  {reservation.payment_status === "REMBOURSEE" && (
                    <span className="rounded-md border border-attention/30 bg-attention-doux px-2 py-0.5 text-[11px] font-semibold text-attention">
                      Remboursement en cours
                    </span>
                  )}
                </div>

                <p className="mt-1.5 font-heading text-xl font-bold text-navy">
                  {reservation.origin_city} <span className="text-accent">→</span>{" "}
                  {reservation.destination_city}
                </p>

                <p className="mt-1 text-sm text-texte-doux">
                  {formatDay(reservation.travel_date)} · départ{" "}
                  <span className="font-semibold tabular-nums text-navy">
                    {formatTime(reservation.departure_at)}
                  </span>{" "}
                  · {reservation.seats} place{reservation.seats > 1 ? "s" : ""} au nom de{" "}
                  {reservation.passenger_name}
                </p>

                {reservation.boarding_point && (
                  <p className="mt-1 text-sm text-texte-doux">
                    Embarquement : {reservation.boarding_point}
                  </p>
                )}

                {reservation.cancel_reason && (
                  <p className="mt-2 rounded-[10px] bg-alerte-doux px-3 py-2 text-sm leading-6 text-alerte">
                    Motif de l’agence : {reservation.cancel_reason}
                  </p>
                )}

                <p className="mt-3 inline-flex items-baseline gap-2 rounded-[10px] bg-surface-alt px-3 py-2">
                  <span className="text-xs font-semibold text-texte-doux">Référence</span>
                  <span className="select-all font-mono text-base font-bold tracking-wider text-navy">
                    {reservation.reference}
                  </span>
                </p>
              </div>

              <div className="flex flex-col items-start gap-3 border-t border-bordure pt-4 lg:min-w-56 lg:items-end lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0 lg:text-right">
                {reservation.price_usd !== null || reservation.price_cdf !== null ? (
                  <div>
                    <p className="text-xs text-texte-doux">
                      {reservation.payment_status === "PAYEE" ? "Payé" : "À payer sur place"}
                    </p>
                    <p className="font-heading text-xl font-bold tabular-nums text-navy">
                      {reservation.price_usd !== null
                        ? formatMoney(reservation.price_usd * reservation.seats, "USD")
                        : formatMoney(reservation.price_cdf! * reservation.seats, "CDF")}
                    </p>
                  </div>
                ) : null}

                {reservation.status === "CONFIRMEE" && (
                  <div className="w-full space-y-2">
                    {/* §14.1 : le paiement vient après la réservation, et reste
                        facultatif — une agence sans phase 3 encaisse sur place. */}
                    {reservation.payment_status === "PAYEE" && reservation.ticket_id ? (
                      <Link
                        href={`/billet-reservation/${reservation.ticket_id}`}
                        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[10px] bg-succes px-4 text-sm font-bold text-white transition hover:brightness-110"
                      >
                        Voir mon billet
                      </Link>
                    ) : paiementOuvert.has(reservation.company_id) ? (
                      <Link
                        href={`/paiement/${reservation.id}`}
                        className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[10px] bg-accent px-4 text-sm font-bold text-white transition hover:bg-accent-profond"
                      >
                        {reservation.payment_status === "EN_ATTENTE"
                          ? "Reprendre le paiement"
                          : "Payer maintenant"}
                      </Link>
                    ) : null}
                    <ContactAgence
                      telephone={reservation.company_phone}
                      whatsapp={reservation.company_whatsapp}
                      messageWhatsapp={`Bonjour ${reservation.compagnie}, réservation Mobembo ${reservation.reference} — ${reservation.origin_city} → ${reservation.destination_city}, ${reservation.travel_date} à ${reservation.departure_time}.`}
                      lieu={
                        reservation.boarding_point
                          ? `${reservation.boarding_point}, ${reservation.origin_city}`
                          : reservation.origin_city
                      }
                      gps={reservation.boarding_gps}
                      compact
                    />
                    {annulable && (
                      <AnnulerReservation
                        reservationId={reservation.id}
                        reference={reservation.reference}
                      />
                    )}
                  </div>
                )}

                <MiseAJour iso={reservation.updated_at} />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
