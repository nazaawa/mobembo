import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { publicAgencyBySlug } from "@/lib/domain/directory";
import { formatDays, parseDays, publicSchedulesOfCompany } from "@/lib/domain/schedules";
import { todayInKinshasa } from "@/lib/core/time";
import { ContactAgence, LogoAgence, MiseAJour, PrixOffre } from "@/components/offre";

export const dynamic = "force-dynamic";

export async function generateMetadata(props: PageProps<"/agences/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const fiche = await publicAgencyBySlug(slug);
  if (!fiche) return { title: "Agence introuvable — Mobembo" };
  return {
    title: `${fiche.compagnie.name} — horaires, tarifs et contact | Mobembo`,
    description:
      fiche.compagnie.description ??
      `Horaires, tarifs et coordonnées de ${fiche.compagnie.name} sur les axes ${fiche.villes.slice(0, 4).join(", ")}.`,
  };
}

/**
 * Phase 1 — §4.4 « Fiche agence ».
 *
 * Cette page est ce que Mobembo offre à une agence en échange de son
 * référencement : une présence publique complète, tenue à jour par elle-même,
 * sans qu'elle ait à vendre un seul billet en ligne. Tout ce qui manque reste
 * visiblement manquant plutôt qu'inventé.
 */
export default async function FicheAgence(props: PageProps<"/agences/[slug]">) {
  const { slug } = await props.params;
  const fiche = await publicAgencyBySlug(slug);
  if (!fiche) notFound();

  const { compagnie, points, villes, derniereMiseAJour } = fiche;
  const horaires = await publicSchedulesOfCompany(compagnie.id);
  const aujourdhui = todayInKinshasa();
  const services = (compagnie.services ?? "")
    .split("\n")
    .map((ligne) => ligne.trim())
    .filter(Boolean);

  const axes = new Map<string, typeof horaires>();
  for (const horaire of horaires) {
    const cle = `${horaire.origin_city} → ${horaire.destination_city}`;
    axes.set(cle, [...(axes.get(cle) ?? []), horaire]);
  }

  return (
    <div className="pb-4">
      <nav aria-label="Fil d’Ariane" className="mb-6 text-sm text-texte-doux">
        <Link href="/agences" className="font-medium hover:text-accent">
          Les agences
        </Link>
        <span className="mx-2" aria-hidden>
          ›
        </span>
        <span className="text-navy">{compagnie.name}</span>
      </nav>

      <header className="grid gap-8 border-b border-bordure pb-9 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-12">
        <div className="min-w-0">
          <div className="flex items-start gap-4">
            <LogoAgence nom={compagnie.name} logo={compagnie.logo} taille={64} />
            <div className="min-w-0">
              <h1 className="font-heading text-3xl font-bold leading-[1.05] tracking-[-0.02em] text-navy sm:text-5xl">
                {compagnie.name}
              </h1>
              <p className="mt-2 text-sm text-texte-doux">
                {compagnie.kind === "INDEPENDANT" ? "Transporteur indépendant" : "Compagnie de transport"}
                {compagnie.head_office_city && ` · ${compagnie.head_office_city}`}
              </p>
            </div>
          </div>

          {compagnie.description && (
            <p className="mt-6 max-w-[68ch] text-base leading-7 text-texte">{compagnie.description}</p>
          )}

          {villes.length > 0 && (
            <div className="mt-6">
              <h2 className="text-xs font-bold uppercase tracking-[0.1em] text-texte-doux">
                Villes desservies
              </h2>
              <ul className="mt-2.5 flex flex-wrap gap-2">
                {villes.map((ville) => (
                  <li
                    key={ville}
                    className="rounded-[10px] border border-bordure bg-surface px-3 py-1.5 text-sm font-medium text-navy"
                  >
                    {ville}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-6">
            <MiseAJour iso={derniereMiseAJour} />
          </div>
        </div>

        <aside className="rounded-[14px] border border-bordure bg-surface p-5 lg:sticky lg:top-24">
          <h2 className="font-heading text-lg font-bold text-navy">Joindre l’agence</h2>
          {compagnie.phone || compagnie.whatsapp ? (
            <>
              <div className="mt-4">
                <ContactAgence
                  telephone={compagnie.phone}
                  whatsapp={compagnie.whatsapp}
                  messageWhatsapp={`Bonjour ${compagnie.name}, je vous contacte depuis Mobembo au sujet d’un voyage.`}
                />
              </div>
              {compagnie.phone && (
                <p className="mt-3 select-all text-sm font-semibold tabular-nums text-navy">
                  {compagnie.phone}
                </p>
              )}
            </>
          ) : (
            <p className="mt-3 text-sm leading-6 text-texte-doux">
              Cette agence n’a pas encore publié de numéro sur Mobembo. Ses horaires ci-dessous
              restent consultables.
            </p>
          )}

          {compagnie.address && (
            <div className="mt-5 border-t border-bordure pt-4">
              <h3 className="text-xs font-bold uppercase tracking-[0.1em] text-texte-doux">Adresse</h3>
              <p className="mt-1.5 text-sm leading-6 text-texte">{compagnie.address}</p>
            </div>
          )}

          {compagnie.email && (
            <div className="mt-4 border-t border-bordure pt-4">
              <h3 className="text-xs font-bold uppercase tracking-[0.1em] text-texte-doux">E-mail</h3>
              <a
                href={`mailto:${compagnie.email}`}
                className="mt-1.5 inline-flex min-h-11 items-center text-sm font-semibold text-accent hover:underline"
              >
                {compagnie.email}
              </a>
            </div>
          )}

          {services.length > 0 && (
            <div className="mt-4 border-t border-bordure pt-4">
              <h3 className="text-xs font-bold uppercase tracking-[0.1em] text-texte-doux">
                Services proposés
              </h3>
              <ul className="mt-2 space-y-1.5 text-sm text-texte">
                {services.map((service) => (
                  <li key={service} className="flex gap-2">
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-accent" aria-hidden />
                    {service}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </header>

      <section aria-labelledby="horaires" className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 id="horaires" className="font-heading text-2xl font-bold tracking-[-0.02em] text-navy sm:text-3xl">
            Horaires et tarifs
          </h2>
          <p className="text-sm text-texte-doux">
            Publiés par l’agence. Vérifiez l’horaire avec elle avant de vous déplacer.
          </p>
        </div>

        {horaires.length === 0 ? (
          <p className="mt-5 rounded-[14px] border border-dashed border-bordure bg-surface px-6 py-10 text-center text-sm leading-6 text-texte-doux">
            Cette agence n’a pas encore publié d’horaire sur Mobembo.
            {(compagnie.phone || compagnie.whatsapp) && " Contactez-la directement pour connaître ses départs."}
          </p>
        ) : (
          <div className="mt-5 space-y-7">
            {[...axes.entries()].map(([axe, services]) => (
              <div key={axe}>
                <h3 className="font-heading text-lg font-bold text-navy">{axe}</h3>
                <ul className="mt-2.5 divide-y divide-bordure overflow-hidden rounded-[14px] border border-bordure bg-surface">
                  {services.map((horaire) => (
                    <li
                      key={horaire.id}
                      className="grid gap-4 p-4 sm:grid-cols-[6rem_minmax(0,1fr)_auto] sm:items-center sm:p-5"
                    >
                      <div>
                        <p className="font-heading text-2xl font-bold tabular-nums text-navy">
                          {horaire.departure_time}
                        </p>
                        <p className="text-xs text-texte-doux">
                          {formatDays(parseDays(horaire.days_of_week))}
                        </p>
                      </div>

                      <div className="min-w-0">
                        {horaire.boarding_point && (
                          <p className="text-sm text-texte">
                            <span className="font-semibold text-navy">Départ :</span>{" "}
                            {horaire.boarding_point}
                          </p>
                        )}
                        {horaire.vehicle_label && (
                          <p className="mt-0.5 text-sm text-texte-doux">{horaire.vehicle_label}</p>
                        )}
                        {horaire.notes && (
                          <p className="mt-1 text-sm leading-6 text-texte-doux">{horaire.notes}</p>
                        )}
                        <div className="mt-1.5">
                          <MiseAJour iso={horaire.updated_at} />
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-4 sm:flex-col sm:items-end sm:justify-start sm:text-right">
                        <PrixOffre usd={horaire.price_usd} cdf={horaire.price_cdf} indicatif />
                        <Link
                          href={`/horaire/${horaire.id}?date=${aujourdhui}`}
                          className="inline-flex min-h-11 items-center justify-center rounded-[10px] border border-bordure px-4 text-sm font-bold text-navy transition hover:border-accent hover:text-accent"
                        >
                          {horaire.booking_enabled === 1 ? "Réserver" : "Voir le départ"}
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      {points.length > 0 && (
        <section aria-labelledby="points-de-vente" className="mt-12 border-t border-bordure pt-9">
          <h2 id="points-de-vente" className="font-heading text-2xl font-bold tracking-[-0.02em] text-navy">
            Points de vente
          </h2>
          <ul className="mt-4 divide-y divide-bordure overflow-hidden rounded-[14px] border border-bordure bg-surface">
            {points.map((point) => (
              <li key={point.id} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-5">
                <div className="min-w-0">
                  <p className="font-semibold text-navy">{point.name}</p>
                  <p className="mt-0.5 text-sm text-texte-doux">
                    {point.city}
                    {point.address && ` · ${point.address}`}
                  </p>
                  {point.opening_hours && (
                    <p className="mt-0.5 text-sm text-texte-doux">{point.opening_hours}</p>
                  )}
                </div>
                <ContactAgence gps={point.gps} lieu={`${point.address ?? point.name}, ${point.city}`} compact />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
