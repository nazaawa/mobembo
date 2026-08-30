import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { currentSession } from "@/lib/auth/session";
import {
  TICKET_STATUS_LABELS,
  digitalTicket,
  expirePastTickets,
  type ScheduleTicketStatus,
} from "@/lib/domain/reservation-payments";
import { formatDateTime, formatDay, formatTime } from "@/lib/core/time";
import { formatMoney } from "@/lib/core/money";
import { Card } from "@/components/ui";
import { QrCode } from "@/components/qr";
import { ContactAgence } from "@/components/offre";
import { ConnexionPassager } from "../../mes-billets/connexion";
import { PartagerBillet } from "./partage";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Mon billet — Mobembo" };

const TONE: Record<ScheduleTicketStatus, string> = {
  VALIDE: "border-succes/30 bg-succes-doux text-succes",
  UTILISE: "border-accent/30 bg-accent-doux text-accent",
  ANNULE: "border-alerte/30 bg-alerte-doux text-alerte",
  EXPIRE: "border-bordure bg-surface-alt text-texte-doux",
};

/**
 * §14.3 Billet numérique — nom du voyageur, agence, trajet, date, heure, point
 * de départ, numéro de billet, QR code, statut.
 *
 * Aucun siège : la note n'en met pas sur ce billet, et numéroter les places
 * appartient à la phase 4 (§19.2). Le billet vaut pour N places sur un départ,
 * ce qui correspond à une agence qui embarque sans plan de sièges.
 *
 * Le QR est rendu en SVG côté serveur : le billet reste affichable sur un
 * téléphone qui perd le réseau après le chargement — c'est la situation
 * normale au bord de la route, pas l'exception.
 */
export default async function BilletReservation(props: PageProps<"/billet-reservation/[ticketId]">) {
  const { ticketId } = await props.params;
  const session = await currentSession();

  if (!session || session.activeRole !== "PASSAGER") {
    return (
      <Card title="Accéder à ce billet" subtitle="Vérifiez d'abord votre numéro de téléphone.">
        <ConnexionPassager />
      </Card>
    );
  }

  await expirePastTickets();
  const billet = await digitalTicket(ticketId);
  if (!billet) notFound();
  if (billet.reservation.passenger_phone !== session.phone) notFound();

  const { reservation } = billet;
  const statut = billet.status;
  const valide = statut === "VALIDE";

  return (
    <div className="mx-auto max-w-2xl pb-4">
      <nav aria-label="Fil d’Ariane" className="mb-6 text-sm text-texte-doux sans-impression">
        <Link href="/mes-billets" className="font-medium hover:text-accent">
          Mes billets
        </Link>
        <span className="mx-2" aria-hidden>›</span>
        <span className="text-navy">{billet.ticket_code}</span>
      </nav>

      <article className="billet-imprimable overflow-hidden rounded-[14px] border border-bordure bg-surface">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-bordure bg-navy px-5 py-4 text-white">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/60">
              Billet Mobembo
            </p>
            <p className="mt-1 font-heading text-lg font-bold">{reservation.compagnie}</p>
          </div>
          <span
            className={`inline-flex items-center rounded-md border px-2.5 py-1 text-[11px] font-bold ${TONE[statut]}`}
          >
            {TICKET_STATUS_LABELS[statut]}
          </span>
        </header>

        <div className="grid gap-6 p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
          <div className="min-w-0">
            <h1 className="font-heading text-2xl font-bold leading-tight tracking-[-0.02em] text-navy sm:text-3xl">
              {reservation.origin_city} <span className="text-accent">→</span>{" "}
              {reservation.destination_city}
            </h1>

            <dl className="mt-5 divide-y divide-bordure border-y border-bordure text-sm">
              <Ligne label="Voyageur">{reservation.passenger_name}</Ligne>
              <Ligne label="Date">{formatDay(reservation.travel_date)}</Ligne>
              <Ligne label="Heure de départ">
                <span className="tabular-nums">{formatTime(reservation.departure_at)}</span>
              </Ligne>
              <Ligne label="Point de départ">
                {reservation.boarding_point ?? "À confirmer avec l’agence"}
              </Ligne>
              <Ligne label="Places">{billet.seats}</Ligne>
              <Ligne label="Numéro de billet">
                <span className="select-all font-mono font-bold tracking-wider">
                  {billet.ticket_code}
                </span>
              </Ligne>
              <Ligne label="Payé">
                {formatMoney(billet.paid_amount, billet.paid_currency)}
                <span className="ml-2 text-xs font-normal text-texte-doux">
                  le {formatDateTime(billet.issued_at)}
                </span>
              </Ligne>
            </dl>
          </div>

          <div className="justify-self-center text-center">
            <QrCode payload={billet.qr_signature} size={200} />
            <p className="mt-2 max-w-[13rem] text-[11px] leading-4 text-texte-doux">
              {valide
                ? "À présenter au départ. Fonctionne sans réseau."
                : "Ce QR n’est plus valable."}
            </p>
          </div>
        </div>

        {statut === "ANNULE" && (
          <p className="border-t border-bordure bg-alerte-doux px-5 py-3 text-sm leading-6 text-alerte">
            Ce billet a été annulé
            {reservation.cancel_reason ? ` : ${reservation.cancel_reason}` : ""}. Le remboursement
            est traité par {reservation.compagnie}, qui vous recontacte.
          </p>
        )}
      </article>

      <div className="sans-impression mt-5 space-y-4">
        <PartagerBillet
          code={billet.ticket_code}
          resume={`Billet Mobembo ${billet.ticket_code} — ${reservation.compagnie}, ${reservation.origin_city} → ${reservation.destination_city}, ${formatDay(reservation.travel_date)} à ${formatTime(reservation.departure_at)}, ${billet.seats} place(s).`}
        />

        <div className="rounded-[14px] border border-bordure bg-surface p-5">
          <h2 className="text-xs font-bold uppercase tracking-[0.1em] text-texte-doux">
            Aller au point de départ
          </h2>
          <p className="mt-2 text-sm leading-6 text-texte">
            {reservation.boarding_point ?? reservation.origin_city}
          </p>
          <div className="mt-4">
            <ContactAgence
              telephone={reservation.company_phone}
              whatsapp={reservation.company_whatsapp}
              messageWhatsapp={`Bonjour ${reservation.compagnie}, billet Mobembo ${billet.ticket_code}.`}
              lieu={
                reservation.boarding_point
                  ? `${reservation.boarding_point}, ${reservation.origin_city}`
                  : reservation.origin_city
              }
              gps={reservation.boarding_gps}
              compact
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function Ligne({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 py-2.5 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4">
      <dt className="text-xs font-bold uppercase tracking-[0.08em] text-texte-doux sm:pt-0.5">
        {label}
      </dt>
      <dd className="font-semibold text-navy">{children}</dd>
    </div>
  );
}
