import Image from "next/image";
import Link from "next/link";
import { coveredAxes, searchableCities } from "@/lib/domain/offers";
import { activiteAgence, publicDirectory } from "@/lib/domain/directory";
import { todayInKinshasa } from "@/lib/core/time";
import { formatMoney } from "@/lib/core/money";
import { LogoAgence, MiseAJour } from "@/components/offre";
import { SearchForm } from "./search-form";

export const dynamic = "force-dynamic";

/**
 * THESIS: Avant de vendre un billet, Mobembo répond à la question qu'un voyageur pose vraiment : qui part, quand, à quel prix.
 * OWN-WORLD: Bleu nuit, blanc net, rouge mouvement, photo ample — et un tableau des départs de gare plutôt qu'une grille de cartes.
 * STORY: Chercher son axe, voir qui le dessert, choisir entre réserver en ligne et appeler l'agence.
 * FIRST VIEWPORT: Photo de terminal plein cadre, titre à gauche, recherche blanche superposée au bord bas.
 * FORM: Portail d'information et de réservation progressive, où le niveau d'engagement de chaque agence est dit avant le clic.
 */
export default async function AccueilPassager() {
  const aujourdhui = todayInKinshasa();
  const [villes, axes, agences] = await Promise.all([
    searchableCities(),
    coveredAxes(aujourdhui, 8),
    publicDirectory(),
  ]);

  const agencesVedettes = agences.slice(0, 5);
  const villesCouvertes = new Set(axes.flatMap((axe) => [axe.origine, axe.destination])).size;

  return (
    <div>
      <section className="relative left-1/2 -mt-6 min-h-[540px] w-screen -translate-x-1/2 overflow-hidden bg-navy text-white sm:-mt-8 sm:min-h-[620px] lg:min-h-[660px]">
        <Image
          src="/images/mobembo-terminal-hero.png"
          alt="Autocar interurbain prêt au départ dans un terminal congolais"
          fill
          priority
          sizes="100vw"
          className="animate-[hero-installation_1.1s_ease-out_both] object-cover object-[68%_center] sm:object-[62%_center] lg:object-center"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(8,22,45,0.97)_0%,rgba(8,22,45,0.86)_38%,rgba(8,22,45,0.32)_70%,rgba(8,22,45,0.08)_100%)]" />
        <div className="absolute inset-x-0 bottom-0 h-32 bg-[linear-gradient(180deg,transparent,rgba(8,22,45,0.42))]" />
        <div className="relative z-10 mx-auto flex min-h-[540px] max-w-7xl flex-col justify-center px-4 pb-28 pt-12 sm:min-h-[620px] sm:px-6 sm:pb-36 lg:min-h-[660px]">
          <div className="max-w-[900px]">
            <p className="mb-5 inline-flex animate-[leve-entree_0.6s_ease-out_both] items-center gap-2 text-sm font-semibold text-white/82">
              <span className="h-2 w-2 rounded-full bg-accent-clair" aria-hidden />
              Les agences interurbaines de la RDC, réunies au même endroit
            </p>
            <h1 className="max-w-[840px] animate-[leve-entree_0.6s_ease-out_both] text-balance font-heading text-[clamp(2.75rem,6.2vw,5.5rem)] font-bold leading-[0.96] tracking-[-0.03em] [animation-delay:90ms]">
              Qui part, quand, et à quel prix.
            </h1>
            <p className="mt-6 max-w-[560px] animate-[leve-entree_0.6s_ease-out_both] text-base leading-7 text-white/78 sm:text-xl sm:leading-8 [animation-delay:170ms]">
              Cherchez votre trajet parmi les agences référencées. Horaires, tarifs et contacts sont
              publiés par les agences elles-mêmes, avec leur date de mise à jour.
            </p>
          </div>
        </div>
      </section>

      <div
        id="recherche"
        className="relative z-20 mx-auto -mt-20 max-w-[1160px] scroll-mt-28 animate-[leve-entree_0.7s_ease-out_both] sm:-mt-24 sm:px-4 [animation-delay:260ms]"
      >
        <SearchForm villes={villes} defaultDate={aujourdhui} hero />
      </div>

      <section id="axes-disponibles" aria-labelledby="titre-axes" className="scroll-mt-28 py-20 sm:py-24">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-5">
          <div>
            <h2
              id="titre-axes"
              className="text-balance font-heading text-3xl font-bold tracking-[-0.02em] text-navy sm:text-5xl"
            >
              Le tableau des départs
            </h2>
            <p className="mt-3 max-w-xl text-base leading-7 text-texte-doux">
              {axes.length > 0
                ? `${axes.length} axe${axes.length > 1 ? "s" : ""} publié${axes.length > 1 ? "s" : ""}, ${villesCouvertes} ville${villesCouvertes > 1 ? "s" : ""} couverte${villesCouvertes > 1 ? "s" : ""}. Chaque agence décide de ce qu'elle ouvre à la réservation.`
                : "Les premiers axes apparaîtront ici dès qu’une agence publiera ses horaires."}
            </p>
          </div>
          <Link
            href="/agences"
            className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-accent hover:underline"
          >
            Toutes les agences <span aria-hidden>→</span>
          </Link>
        </div>

        {axes.length > 0 ? (
          <div className="overflow-hidden rounded-[14px] border border-bordure bg-surface">
            <div className="hidden grid-cols-[minmax(0,1fr)_7rem_8rem_11rem] gap-4 border-b border-bordure bg-navy px-6 py-3 text-[11px] font-bold uppercase tracking-[0.12em] text-white/70 md:grid">
              <span>Destination</span>
              <span className="text-right">Agences</span>
              <span className="text-right">À partir de</span>
              <span className="text-right">Réservation</span>
            </div>
            <ul className="divide-y divide-bordure">
              {axes.map((axe) => (
                <li key={`${axe.origine}-${axe.destination}`}>
                  <Link
                    href={`/recherche?origine=${encodeURIComponent(axe.origine)}&destination=${encodeURIComponent(axe.destination)}&date=${aujourdhui}`}
                    className="group grid gap-2 px-5 py-4 transition-colors duration-200 ease-depart hover:bg-surface-alt md:grid-cols-[minmax(0,1fr)_7rem_8rem_11rem] md:items-center md:gap-4 md:px-6 md:py-4"
                  >
                    <span className="flex min-w-0 items-baseline gap-2 font-heading text-lg font-bold text-navy">
                      <span className="truncate">{axe.origine}</span>
                      <span
                        className="shrink-0 text-accent transition-transform duration-300 ease-depart group-hover:translate-x-1"
                        aria-hidden
                      >
                        →
                      </span>
                      <span className="truncate">{axe.destination}</span>
                    </span>

                    <span className="text-sm text-texte-doux md:text-right">
                      <span className="font-semibold tabular-nums text-navy">{axe.compagnies}</span>
                      <span className="md:hidden"> agence{axe.compagnies > 1 ? "s" : ""}</span>
                    </span>

                    <span className="text-sm font-bold tabular-nums text-navy md:text-right">
                      {axe.prixMinimumUsd !== null ? formatMoney(axe.prixMinimumUsd, "USD") : "Prix sur demande"}
                    </span>

                    <span className="md:text-right">
                      <span
                        className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold ${
                          axe.reservationEnLigne
                            ? "border-accent/30 bg-accent-doux text-accent"
                            : "border-bordure bg-surface-alt text-texte-doux"
                        }`}
                      >
                        {axe.reservationEnLigne ? "En ligne" : "Auprès de l’agence"}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="flex flex-col items-start justify-between gap-6 rounded-[14px] border border-bordure bg-surface px-6 py-8 sm:flex-row sm:items-center sm:px-8">
            <div className="max-w-2xl">
              <h3 className="font-heading text-xl font-bold text-navy">
                Les premiers axes seront bientôt publiés
              </h3>
              <p className="mt-2 text-sm leading-6 text-texte-doux">
                Il suffit qu’une agence indique une ville de départ, une destination, une heure et un
                prix pour que son départ apparaisse ici.
              </p>
            </div>
            <Link
              href="/partenaires/inscription"
              className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-[10px] border border-bordure px-4 text-sm font-bold text-navy transition hover:border-accent hover:text-accent"
            >
              Référencer mon agence <span aria-hidden>→</span>
            </Link>
          </div>
        )}
      </section>

      {agencesVedettes.length > 0 && (
        <section
          id="agences-referencees"
          aria-labelledby="titre-agences"
          className="relative left-1/2 w-screen -translate-x-1/2 scroll-mt-28 border-y border-bordure bg-surface"
        >
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20">
            <div className="flex flex-wrap items-end justify-between gap-5">
              <h2
                id="titre-agences"
                className="text-balance font-heading text-3xl font-bold tracking-[-0.02em] text-navy sm:text-5xl"
              >
                Les agences référencées
              </h2>
              <p className="max-w-md text-sm leading-6 text-texte-doux">
                Chaque agence dispose d’une fiche publique : villes desservies, horaires, tarifs,
                téléphone et WhatsApp.
              </p>
            </div>

            <ul className="mt-8 divide-y divide-bordure border-y border-bordure">
              {agencesVedettes.map((agence) => (
                <li key={agence.id}>
                  <Link
                    href={`/agences/${agence.slug ?? agence.id}`}
                    className="group flex items-center gap-4 py-4 transition-colors duration-200 ease-depart hover:bg-fond/60"
                  >
                    <LogoAgence nom={agence.name} logo={agence.logo} taille={44} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-heading text-lg font-bold text-navy group-hover:text-accent">
                        {agence.name}
                      </span>
                      <span className="mt-0.5 block truncate text-sm text-texte-doux">
                        {agence.villes ? agence.villes : "Villes desservies à publier"}
                      </span>
                    </span>
                    <span className="hidden shrink-0 text-right sm:block">
                      <span className="block text-sm font-semibold text-navy">
                        {activiteAgence(agence)}
                      </span>
                      {agence.derniereMiseAJour && (
                        <MiseAJour iso={agence.derniereMiseAJour} className="mt-0.5" />
                      )}
                    </span>
                    <span
                      className="shrink-0 text-accent transition-transform duration-300 ease-depart group-hover:translate-x-1"
                      aria-hidden
                    >
                      →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>

            <Link
              href="/agences"
              className="mt-7 inline-flex min-h-12 items-center gap-2 rounded-[10px] bg-navy px-5 text-sm font-bold text-white transition duration-300 ease-depart hover:-translate-y-0.5 hover:bg-navy-profond"
            >
              Parcourir l’annuaire {agences.length > agencesVedettes.length && `(${agences.length})`}
              <span aria-hidden>→</span>
            </Link>
          </div>
        </section>
      )}

      <section
        id="comment-ca-marche"
        className="relative left-1/2 mt-20 w-screen -translate-x-1/2 scroll-mt-28 bg-navy text-white sm:mt-24"
      >
        <div className="mx-auto grid max-w-7xl lg:grid-cols-[1.15fr_0.85fr]">
          <div className="px-4 py-16 sm:px-6 sm:py-20 lg:py-24 lg:pr-20">
            <h2 className="max-w-2xl text-balance font-heading text-3xl font-bold tracking-[-0.02em] sm:text-5xl">
              Réserver en ligne, ou simplement appeler.
            </h2>
            <p className="mt-5 max-w-xl text-base leading-7 text-white/70">
              Certaines agences ouvrent quelques places à la réservation sur Mobembo ; d’autres
              préfèrent que vous les appeliez. Chaque départ dit lequel des deux avant que vous ne
              cliquiez, et votre place réservée reste retrouvable avec votre numéro.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/mes-reservations"
                className="inline-flex min-h-12 items-center gap-2 rounded-[10px] bg-white px-5 text-sm font-bold text-navy transition duration-300 ease-depart hover:-translate-y-0.5 hover:bg-white/90"
              >
                Mes réservations <span aria-hidden>→</span>
              </Link>
              <Link
                href="/mes-billets"
                className="inline-flex min-h-12 items-center gap-2 rounded-[10px] border border-white/25 px-5 text-sm font-bold text-white transition hover:border-white/60"
              >
                Mes billets payés
              </Link>
            </div>
          </div>
          <ol className="divide-y divide-white/10 border-t border-white/10 lg:border-l lg:border-t-0">
            <Step number="1" title="Cherchez" text="Vos deux villes et votre date." />
            <Step number="2" title="Comparez" text="Heure, prix annoncé et point de départ." />
            <Step number="3" title="Réservez" text="En ligne, ou d’un appel à l’agence." />
          </ol>
        </div>
      </section>

      <section
        id="agences-partenaires"
        aria-labelledby="titre-partenaires"
        className="scroll-mt-28 py-20 sm:py-24"
      >
        <div className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-start lg:gap-20">
          <div>
            <h2
              id="titre-partenaires"
              className="max-w-2xl text-balance font-heading text-3xl font-bold tracking-[-0.02em] text-navy sm:text-5xl"
            >
              Référencement gratuit. Vous gardez votre façon de vendre.
            </h2>
            <p className="mt-5 max-w-2xl text-base leading-7 text-texte-doux">
              Publier vos villes, vos heures et vos prix suffit à être trouvé par les voyageurs. Le
              reste — places en ligne, paiement, billet numérique, guichet, contrôle — s’ajoute plus
              tard, si vous le décidez.
            </p>
            <Link
              href="/partenaires/inscription"
              className="mt-8 inline-flex min-h-12 items-center gap-2 rounded-[10px] bg-accent px-5 text-sm font-bold text-white transition duration-300 ease-depart hover:-translate-y-0.5 hover:bg-accent-profond"
            >
              Référencer mon agence <span aria-hidden>→</span>
            </Link>
          </div>

          <div className="rounded-[14px] border border-bordure bg-surface p-6 sm:p-8">
            <h3 className="font-heading text-lg font-bold text-navy">
              Ce que Mobembo ne vous impose pas
            </h3>
            <ul className="mt-4 space-y-3.5">
              <Liberte>Aucun frais de référencement.</Liberte>
              <Liberte>Aucune obligation de vendre vos billets en ligne.</Liberte>
              <Liberte>Aucune obligation d’utiliser un logiciel de gestion.</Liberte>
              <Liberte>
                Vous choisissez combien de places, s’il y en a, vous ouvrez sur Mobembo — le reste
                continue à se vendre à votre guichet.
              </Liberte>
              <Liberte>Vous modifiez un prix ou une heure en quelques secondes.</Liberte>
            </ul>
            <p className="mt-5 border-t border-bordure pt-4 text-sm leading-6 text-texte-doux">
              En contrepartie, les informations que vous publiez affichent leur date de mise à jour :
              c’est ce qui rend l’annuaire fiable pour les voyageurs, et donc utile pour vous.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

function Step({ number, title, text }: { number: string; title: string; text: string }) {
  return (
    <li className="flex min-h-36 items-center gap-5 px-4 py-8 transition-colors duration-300 ease-depart hover:bg-white/[0.04] sm:px-9">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent text-sm font-bold">
        {number}
      </span>
      <div>
        <p className="font-heading text-lg font-bold">{title}</p>
        <p className="mt-1 text-sm leading-6 text-white/62">{text}</p>
      </div>
    </li>
  );
}

function Liberte({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-3 text-sm leading-6 text-texte">
      <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-succes-doux text-succes" aria-hidden>
        <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.2">
          <path d="m3 8 3 3 7-7" />
        </svg>
      </span>
      {children}
    </li>
  );
}
