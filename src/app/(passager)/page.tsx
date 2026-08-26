import Image from "next/image";
import Link from "next/link";
import { knownCities, searchTrips } from "@/lib/domain/planning";
import { todayInKinshasa } from "@/lib/core/time";
import { SearchForm } from "./search-form";
import { Money } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * THESIS: Le départ commence ici, dans une gare lisible qui refuse la petite carte de formulaire isolée.
 * OWN-WORLD: Bleu nuit, blanc net, rouge mouvement, photo ample et contrôles rectangulaires.
 * STORY: Comprendre la promesse, choisir son trajet, puis vérifier prix et garanties avant de chercher.
 * FIRST VIEWPORT: Photo de terminal plein cadre, titre à gauche, recherche blanche superposée au bord bas.
 * FORM: Portail de billetterie opérationnel, direction imposée par les références utilisateur.
 */
export default async function AccueilPassager() {
  const villes = await knownCities();
  const aujourdhui = todayInKinshasa();
  const axesCandidats = [
    ["Kinshasa", "Matadi"],
    ["Kinshasa", "Kikwit"],
    ["Matadi", "Kinshasa"],
  ].filter(([origine, destination]) => villes.includes(origine) && villes.includes(destination));
  const axes = await Promise.all(
    axesCandidats.map(async ([origine, destination]) => ({
      origine,
      destination,
      trajets: await searchTrips({ origin: origine, destination, day: aujourdhui }),
    })),
  );

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
              Billetterie interurbaine · paiement Mobile Money
            </p>
            <h1 className="max-w-[820px] animate-[leve-entree_0.6s_ease-out_both] text-balance font-heading text-[clamp(3rem,6.4vw,5.5rem)] font-bold leading-[0.96] tracking-[-0.03em] [animation-delay:90ms]">
              Votre prochain départ commence ici.
            </h1>
            <p className="mt-6 max-w-[560px] animate-[leve-entree_0.6s_ease-out_both] text-base leading-7 text-white/78 sm:text-xl sm:leading-8 [animation-delay:170ms]">
              Choisissez votre siège, payez par Mobile Money et embarquez avec votre billet QR.
            </p>
          </div>
        </div>
      </section>

      <div id="recherche" className="relative z-20 mx-auto -mt-20 max-w-[1160px] scroll-mt-28 animate-[leve-entree_0.7s_ease-out_both] sm:-mt-24 sm:px-4 [animation-delay:260ms]">
        <SearchForm villes={villes} defaultDate={aujourdhui} hero />
      </div>

      <section aria-labelledby="garanties" className="relative left-1/2 mt-20 w-screen -translate-x-1/2 border-y border-bordure bg-white sm:mt-24">
        <h2 id="garanties" className="sr-only">Les garanties de votre réservation</h2>
        <div className="mx-auto grid max-w-7xl px-4 sm:px-6 md:grid-cols-3">
          <Guarantee icon={<SeatIcon />} title="Siège réellement protégé">
            Dès le paiement, votre place ne peut plus être vendue à quelqu&apos;un d&apos;autre, même au guichet.
          </Guarantee>
          <Guarantee icon={<PhoneIcon />} title="Billet reçu par SMS">
            Votre code, votre siège et votre heure restent accessibles même si votre connexion vous lâche.
          </Guarantee>
          <Guarantee icon={<TransferIcon />} title="Billet flexible">
            Transférez-le gratuitement à un proche ou remettez votre siège en vente en cas d&apos;empêchement.
          </Guarantee>
        </div>
      </section>

      {axes.length > 0 && (
        <section className="py-20 sm:py-28" aria-labelledby="axes-disponibles">
          <div className="mb-9 flex flex-wrap items-end justify-between gap-5">
            <div>
              <p className="text-sm font-semibold text-accent">Départs du jour</p>
              <h2 id="axes-disponibles" className="mt-2 text-balance font-heading text-3xl font-bold tracking-[-0.02em] text-navy sm:text-5xl">
                Quelques axes disponibles
              </h2>
            </div>
            <p className="max-w-md text-sm leading-6 text-texte-doux">
              Les horaires et places sont vérifiés au moment de la recherche.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {axes.map(({ origine, destination, trajets }) => {
              const premier = trajets[0];
              return (
                <Link
                  key={`${origine}-${destination}`}
                  href={`/recherche?origine=${encodeURIComponent(origine)}&destination=${encodeURIComponent(destination)}&date=${aujourdhui}`}
                  className="group flex min-h-44 flex-col justify-between rounded-[14px] bg-white p-6 shadow-[0_10px_30px_rgba(8,22,45,0.06)] transition-[transform,box-shadow] duration-300 ease-depart hover:-translate-y-1 hover:shadow-[0_18px_42px_rgba(8,22,45,0.11)]"
                >
                  <div className="flex items-center gap-3 text-sm text-texte-doux">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-accent-doux text-accent transition-transform duration-300 ease-depart group-hover:scale-110"><PinIcon /></span>
                    {trajets.length > 0 ? `${trajets.length} départ${trajets.length > 1 ? "s" : ""}` : "Consulter les départs"}
                  </div>
                  <div className="mt-7 flex items-end justify-between gap-4">
                    <div>
                      <p className="font-heading text-lg font-bold text-navy">{origine}</p>
                      <p className="mt-0.5 text-sm text-texte-doux">vers {destination}</p>
                    </div>
                    <div className="text-right">
                      {premier && <p className="text-sm font-bold text-navy">dès <Money amount={premier.prixUsd} currency="USD" /></p>}
                      <span className="mt-1 inline-flex text-sm font-semibold text-accent">Voir <span className="ml-1 transition-transform duration-300 ease-depart group-hover:translate-x-1">→</span></span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <section
        id="comment-ca-marche"
        className={`relative left-1/2 w-screen -translate-x-1/2 scroll-mt-28 bg-navy text-white ${axes.length === 0 ? "mt-20 sm:mt-28" : ""}`}
      >
        <div className="mx-auto grid max-w-7xl lg:grid-cols-[1.15fr_0.85fr]">
          <div className="px-4 py-16 sm:px-6 sm:py-20 lg:py-24 lg:pr-20">
            <p className="text-sm font-semibold text-accent-clair">Simple du début à la fin</p>
            <h2 className="mt-3 max-w-2xl text-balance font-heading text-3xl font-bold tracking-[-0.02em] sm:text-5xl">
              Moins d&apos;attente. Plus de certitude avant le départ.
            </h2>
            <p className="mt-5 max-w-xl text-base leading-7 text-white/70">
              Mobembo protège votre siège pendant le paiement et vous remet un billet vérifiable même sans réseau à l&apos;embarquement.
            </p>
            <Link href="/mes-billets" className="mt-8 inline-flex min-h-11 items-center gap-2 rounded-[10px] bg-white px-5 text-sm font-bold text-navy transition duration-300 ease-depart hover:-translate-y-0.5 hover:bg-white/90">
              Retrouver mes billets <span aria-hidden>→</span>
            </Link>
          </div>
          <ol className="divide-y divide-white/10 border-t border-white/10 lg:border-l lg:border-t-0">
            <Step number="1" title="Cherchez" text="Choisissez vos villes et votre date." />
            <Step number="2" title="Réservez" text="Sélectionnez le siège qui vous convient." />
            <Step number="3" title="Embarquez" text="Présentez votre QR ou le code reçu par SMS." />
          </ol>
        </div>
      </section>
    </div>
  );
}

function Guarantee({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="group flex gap-4 border-b border-bordure py-7 transition-colors duration-300 ease-depart last:border-b-0 md:border-b-0 md:border-r md:px-7 md:last:border-r-0 md:first:pl-0 md:last:pr-0 sm:py-8 lg:px-10 lg:first:pl-0 lg:last:pr-0">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[10px] bg-accent-doux text-accent transition-transform duration-300 ease-depart group-hover:scale-105">{icon}</span>
      <div>
        <h3 className="font-heading font-bold text-navy">{title}</h3>
        <p className="mt-1.5 text-sm leading-6 text-texte-doux">{children}</p>
      </div>
    </div>
  );
}

function Step({ number, title, text }: { number: string; title: string; text: string }) {
  return (
    <li className="flex min-h-36 items-center gap-5 px-4 py-8 transition-colors duration-300 ease-depart hover:bg-white/[0.04] sm:px-9">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent text-sm font-bold">{number}</span>
      <div><p className="font-heading text-lg font-bold">{title}</p><p className="mt-1 text-sm leading-6 text-white/62">{text}</p></div>
    </li>
  );
}

const iconClass = "h-5 w-5";
function SeatIcon() {
  return (
    <svg viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M7 12V6a3 3 0 0 1 6 0v6M5 12h14v5H5zM7 17v3m10-3v3" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="7" y="2" width="10" height="20" rx="2" />
      <path d="M10 5h4m-3 14h2" />
    </svg>
  );
}

function TransferIcon() {
  return (
    <svg viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 7h13m0 0-3-3m3 3-3 3M20 17H7m0 0 3 3m-3-3 3-3" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" className={iconClass} fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}
