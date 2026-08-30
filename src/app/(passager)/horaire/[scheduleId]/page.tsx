import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  formatDays,
  parseDays,
  publicScheduleById,
  upcomingScheduleDays,
} from "@/lib/domain/schedules";
import { settleFinishedReservations } from "@/lib/domain/reservations";
import { companyAccess, hasModule } from "@/lib/domain/access";
import { formatDay, formatTime, todayInKinshasa } from "@/lib/core/time";
import { VEHICLE_TYPE_LABELS } from "@/lib/domain/types";
import { ContactAgence, LogoAgence, MiseAJour, PrixOffre } from "@/components/offre";
import { ReserverPlace } from "./reservation";
import { ChoixDate } from "./choix-date";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: PageProps<"/horaire/[scheduleId]">): Promise<Metadata> {
  const { scheduleId } = await props.params;
  const horaire = await publicScheduleById(scheduleId);
  if (!horaire) return { title: "Départ introuvable — Mobembo" };
  return {
    title: `${horaire.origin_city} → ${horaire.destination_city} à ${horaire.departure_time} — ${horaire.compagnie} | Mobembo`,
    description: `Départ ${horaire.origin_city} → ${horaire.destination_city} à ${horaire.departure_time}, opéré par ${horaire.compagnie}.`,
  };
}

/**
 * Phase 1 §4.5 « Fiche trajet » et Phase 2 §10.2 « Réserver une place ».
 *
 * La même page sert les deux niveaux d'engagement d'une agence : celle qui
 * publie seulement son horaire y expose ses moyens de contact, celle qui a
 * ouvert un quota y ouvre un formulaire de réservation. Le voyageur voit tout
 * de suite lequel des deux il a devant lui — c'est la promesse à ne jamais
 * brouiller.
 */
export default async function FicheHoraire(props: PageProps<"/horaire/[scheduleId]">) {
  const { scheduleId } = await props.params;
  const params = await props.searchParams;
  const horaire = await publicScheduleById(scheduleId);
  if (!horaire) notFound();

  await settleFinishedReservations();

  const aujourdhui = todayInKinshasa();
  const jours = await upcomingScheduleDays(horaire, aujourdhui);
  const demande = typeof params.date === "string" ? params.date : null;
  const jourChoisi =
    jours.find((jour) => jour.date === demande) ?? jours[0] ?? null;

  const acces = await companyAccess(horaire.company_id);
  const paiementEnLigne = hasModule(acces, "PAIEMENT");
  const suspendu = horaire.status === "SUSPENDU";
  const reservable = horaire.booking_enabled === 1 && horaire.online_quota > 0 && !suspendu;
  const lieuItineraire = horaire.boarding_point
    ? `${horaire.boarding_point}, ${horaire.origin_city}`
    : horaire.origin_city;
  const arriveeEstimee =
    jourChoisi && horaire.duration_est_min
      ? new Date(new Date(jourChoisi.depart).getTime() + horaire.duration_est_min * 60_000).toISOString()
      : null;

  return (
    <div className="pb-4">
      <nav aria-label="Fil d’Ariane" className="mb-6 text-sm text-texte-doux">
        <Link href="/agences" className="font-medium hover:text-accent">
          Les agences
        </Link>
        <span className="mx-2" aria-hidden>›</span>
        <Link
          href={`/agences/${horaire.company_slug ?? horaire.company_id}`}
          className="font-medium hover:text-accent"
        >
          {horaire.compagnie}
        </Link>
        <span className="mx-2" aria-hidden>›</span>
        <span className="text-navy">
          {horaire.origin_city} → {horaire.destination_city}
        </span>
      </nav>

      {suspendu && (
        <p
          role="status"
          className="mb-6 rounded-[14px] border border-attention/30 bg-attention-doux px-4 py-3 text-sm leading-6 text-attention"
        >
          <strong className="font-bold">Départ suspendu.</strong>{" "}
          {horaire.suspended_reason ?? "Cet horaire est temporairement retiré de la recherche."}{" "}
          Contactez l’agence avant de vous déplacer.
        </p>
      )}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_23rem] lg:items-start lg:gap-10">
        <div className="min-w-0">
          <header className="border-b border-bordure pb-7">
            <div className="flex flex-wrap items-center gap-3">
              <LogoAgence nom={horaire.compagnie} logo={horaire.company_logo} taille={40} />
              <Link
                href={`/agences/${horaire.company_slug ?? horaire.company_id}`}
                className="font-semibold text-navy hover:text-accent"
              >
                {horaire.compagnie}
              </Link>
              <span className="rounded-md border border-bordure bg-surface-alt px-2 py-0.5 text-[11px] font-medium text-texte-doux">
                {VEHICLE_TYPE_LABELS[horaire.vehicle_type]}
                {horaire.vehicle_label && ` · ${horaire.vehicle_label}`}
              </span>
            </div>

            <h1 className="mt-4 font-heading text-3xl font-bold leading-[1.05] tracking-[-0.02em] text-navy sm:text-5xl">
              {horaire.origin_city} <span className="text-accent">→</span> {horaire.destination_city}
            </h1>

            <div className="mt-5 flex flex-wrap items-baseline gap-x-6 gap-y-2">
              <p className="font-heading text-3xl font-bold tabular-nums text-navy">
                {horaire.departure_time}
              </p>
              <p className="text-sm text-texte-doux">
                {formatDays(parseDays(horaire.days_of_week))}
                {horaire.duration_est_min && ` · environ ${duree(horaire.duration_est_min)} de route`}
              </p>
            </div>

            <div className="mt-4">
              <MiseAJour iso={horaire.updated_at} />
            </div>
          </header>

          <dl className="grid gap-x-8 gap-y-6 border-b border-bordure py-7 sm:grid-cols-2">
            <Detail label="Prix annoncé par l’agence">
              <PrixOffre usd={horaire.price_usd} cdf={horaire.price_cdf} indicatif={false} />
              <p className="mt-1 text-xs leading-5 text-texte-doux">
                {paiementEnLigne
                  ? "Payable en ligne par Mobile Money, ou à l’agence le jour du départ. Aucun frais n’est ajouté au voyageur."
                  : "Le paiement se fait auprès de l’agence. Mobembo n’encaisse rien sur ce départ."}
              </p>
            </Detail>

            <Detail label="Point d’embarquement">
              {horaire.boarding_point ? (
                <>
                  <p className="text-base font-semibold text-navy">{horaire.boarding_point}</p>
                  <p className="mt-0.5 text-sm text-texte-doux">{horaire.origin_city}</p>
                </>
              ) : (
                <p className="text-sm text-texte-doux">
                  Non précisé. Demandez-le à l’agence avant le départ.
                </p>
              )}
            </Detail>

            {jourChoisi && (
              <Detail label="Départ retenu">
                <p className="text-base font-semibold text-navy">{formatDay(jourChoisi.date)}</p>
                <p className="mt-0.5 text-sm tabular-nums text-texte-doux">
                  {formatTime(jourChoisi.depart)}
                  {arriveeEstimee && ` → arrivée estimée ${formatTime(arriveeEstimee)}`}
                </p>
              </Detail>
            )}

            {horaire.agence && (
              <Detail label="Agence de départ">
                <p className="text-base font-semibold text-navy">{horaire.agence}</p>
                {horaire.agence_adresse && (
                  <p className="mt-0.5 text-sm text-texte-doux">{horaire.agence_adresse}</p>
                )}
              </Detail>
            )}
          </dl>

          {horaire.notes && (
            <section className="border-b border-bordure py-7">
              <h2 className="text-xs font-bold uppercase tracking-[0.1em] text-texte-doux">
                Informations importantes
              </h2>
              <p className="mt-2 max-w-[68ch] text-base leading-7 text-texte">{horaire.notes}</p>
            </section>
          )}

          {jours.length > 1 && (
            <section className="py-7">
              <h2 className="font-heading text-lg font-bold text-navy">Prochains départs</h2>
              <p className="mt-1 text-sm text-texte-doux">
                Ce service circule {formatDays(parseDays(horaire.days_of_week)).toLowerCase()}.
              </p>
              <ChoixDate scheduleId={horaire.id} jours={jours} selection={jourChoisi?.date ?? null} reservable={reservable} />
            </section>
          )}
        </div>

        <aside className="lg:sticky lg:top-24">
          {reservable && jourChoisi ? (
            <ReserverPlace
              horaireId={horaire.id}
              compagnie={horaire.compagnie}
              axe={`${horaire.origin_city} → ${horaire.destination_city}`}
              heure={horaire.departure_time}
              date={jourChoisi.date}
              dateLisible={formatDay(jourChoisi.date)}
              restantes={jourChoisi.restantes}
              quota={jourChoisi.quota}
              prixUsd={horaire.price_usd}
              prixCdf={horaire.price_cdf}
              telephone={horaire.company_phone}
              whatsapp={horaire.company_whatsapp}
              paiementEnLigne={paiementEnLigne}
            />
          ) : (
            <div className="rounded-[14px] border border-bordure bg-surface p-5">
              <h2 className="font-heading text-xl font-bold text-navy">
                {jours.length === 0 ? "Aucun départ à venir" : "Réservation auprès de l’agence"}
              </h2>
              <p className="mt-2 text-sm leading-6 text-texte-doux">
                {jours.length === 0
                  ? "Ce service n’a pas de prochain départ publié. Contactez l’agence pour connaître ses disponibilités."
                  : `${horaire.compagnie} publie cet horaire sur Mobembo mais garde sa billetterie chez elle. Appelez ou écrivez pour retenir votre place.`}
              </p>
              <div className="mt-5">
                <ContactAgence
                  telephone={horaire.company_phone}
                  whatsapp={horaire.company_whatsapp}
                  messageWhatsapp={`Bonjour ${horaire.compagnie}, je souhaite réserver une place sur le départ ${horaire.origin_city} → ${horaire.destination_city} de ${horaire.departure_time}${jourChoisi ? ` du ${formatDay(jourChoisi.date)}` : ""}. (via Mobembo)`}
                  lieu={lieuItineraire}
                  gps={horaire.boarding_gps}
                />
              </div>
              {!horaire.company_phone && !horaire.company_whatsapp && (
                <p className="mt-4 rounded-[10px] bg-surface-alt px-3 py-2.5 text-sm leading-6 text-texte-doux">
                  Cette agence n’a pas encore publié de contact. Rendez-vous au point d’embarquement
                  indiqué ci-contre.
                </p>
              )}
            </div>
          )}

          <div className="mt-4 rounded-[14px] border border-bordure bg-surface p-5">
            <h2 className="text-xs font-bold uppercase tracking-[0.1em] text-texte-doux">
              Aller au point de départ
            </h2>
            <p className="mt-2 text-sm leading-6 text-texte">
              {horaire.boarding_point ?? `Point d’embarquement à confirmer, ${horaire.origin_city}`}
            </p>
            <div className="mt-4">
              <ContactAgence lieu={lieuItineraire} gps={horaire.boarding_gps} compact />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-bold uppercase tracking-[0.1em] text-texte-doux">{label}</dt>
      <dd className="mt-1.5">{children}</dd>
    </div>
  );
}

function duree(minutes: number) {
  const heures = Math.floor(minutes / 60);
  const reste = minutes % 60;
  return reste === 0 ? `${heures} h` : `${heures} h ${String(reste).padStart(2, "0")}`;
}
