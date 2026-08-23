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
  const villes = knownCities();
  const aujourdhui = todayInKinshasa();
  const axes = [
    ["Kinshasa", "Matadi"],
    ["Kinshasa", "Kikwit"],
    ["Matadi", "Kinshasa"],
  ]
    .filter(([origine, destination]) => villes.includes(origine) && villes.includes(destination))
    .map(([origine, destination]) => ({
      origine,
      destination,
      trajets: searchTrips({ origin: origine, destination, day: aujourdhui }),
    }));

  return (
    <div>
      <section className="relative -mt-6 mx-[calc(50%-50vw)] w-screen min-h-[460px] overflow-hidden bg-navy text-white sm:-mt-8 sm:min-h-[580px] lg:min-h-[660px]">
        <Image
          src="/images/mobembo-terminal-hero.png"
          alt="Autocar interurbain prêt au départ dans un terminal congolais"
          fill
          priority
          sizes="100vw"
          className="animate-[hero-installation_1.1s_ease-out_both] object-cover object-[66%_center] sm:object-center"
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(8,22,45,0.96)_0%,rgba(8,22,45,0.8)_40%,rgba(8,22,45,0.2)_78%,rgba(8,22,45,0.08)_100%)]" />
        <div className="relative z-10 mx-auto flex min-h-[460px] max-w-7xl flex-col justify-center px-5 pb-24 pt-10 sm:min-h-[580px] sm:px-10 sm:pb-36 sm:pt-14 lg:min-h-[660px] lg:px-16">
          <div className="max-w-[900px]">

            <h1 className="max-w-[860px] animate-[leve-entree_0.6s_ease-out_both] font-heading text-[clamp(2.75rem,6.4vw,5rem)] font-bold leading-[0.98] tracking-[-0.02em] text-balance [animation-delay:90ms]">
              Votre prochain départ commence ici.
            </h1>
            <p className="mt-5 max-w-[540px] animate-[leve-entree_0.6s_ease-out_both] text-base leading-7 text-white/78 sm:text-lg [animation-delay:170ms]">
              Choisissez votre siège, payez par Mobile Money et embarquez avec votre billet QR.
            </p>
          </div>
        </div>
      </section>

      <div className="relative z-20 mx-auto -mt-16 max-w-[1120px] animate-[leve-entree_0.7s_ease-out_both] px-3 sm:-mt-24 sm:px-6 [animation-delay:260ms]">
        <SearchForm villes={villes} defaultDate={aujourdhui} hero />
      </div>

      <section aria-labelledby="garanties" className="mt-16 overflow-hidden rounded-[14px] bg-white sm:mt-20">
        <h2 id="garanties" className="sr-only">Les garanties de votre réservation</h2>
        <div className="grid md:grid-cols-3">
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
        <section className="py-16 sm:py-20" aria-labelledby="axes-disponibles">
          <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-accent">Voyagez aujourd&apos;hui</p>
              <h2 id="axes-disponibles" className="mt-1 font-heading text-3xl font-bold tracking-[-0.02em] text-navy sm:text-4xl">
                Quelques axes disponibles
              </h2>
            </div>
            <p className="max-w-md text-sm leading-6 text-texte-doux">
              Les horaires et places sont vérifiés au moment de la recherche.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {axes.map(({ origine, destination, trajets }, index) => {
              const premier = trajets[0];
              return (
                <Link
                  key={`${origine}-${destination}`}
                  href={`/recherche?origine=${encodeURIComponent(origine)}&destination=${encodeURIComponent(destination)}&date=${aujourdhui}`}
                  className="group flex min-h-36 animate-[leve-entree_0.6s_ease-out_both] flex-col justify-between rounded-[14px] border border-bordure bg-white p-5 ease-depart transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-1 hover:border-transparent hover:shadow-[0_16px_36px_rgba(8,22,45,0.10)]"
                  style={{ animationDelay: `${index * 70}ms` }}
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

      <section className="grid overflow-hidden rounded-[18px] bg-navy text-white lg:grid-cols-[1.15fr_0.85fr]">
        <div className="p-7 sm:p-10 lg:p-14">
          <p className="text-sm font-semibold text-accent-clair">Simple du début à la fin</p>
          <h2 className="mt-2 max-w-xl font-heading text-3xl font-bold tracking-[-0.02em] sm:text-4xl">
            Moins d&apos;attente. Plus de certitude avant le départ.
          </h2>
          <p className="mt-4 max-w-xl text-sm leading-6 text-white/68 sm:text-base">
            Mobembo protège votre siège pendant le paiement et vous remet un billet vérifiable même sans réseau à l&apos;embarquement.
          </p>
          <Link href="/mes-billets" className="mt-7 inline-flex min-h-11 items-center gap-2 rounded-[10px] bg-white px-5 text-sm font-bold text-navy transition duration-300 ease-depart hover:-translate-y-0.5 hover:bg-white/90">
            Retrouver mes billets <span aria-hidden>→</span>
          </Link>
        </div>
        <ol className="divide-y divide-white/10 border-t border-white/10 lg:border-l lg:border-t-0">
          <Step number="1" title="Cherchez" text="Choisissez vos villes et votre date." />
          <Step number="2" title="Réservez" text="Sélectionnez le siège qui vous convient." />
          <Step number="3" title="Embarquez" text="Présentez votre QR ou le code reçu par SMS." />
        </ol>
      </section>
    </div>
  );
}

function Guarantee({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="group flex gap-4 border-b border-bordure p-6 transition-colors duration-300 ease-depart last:border-b-0 hover:bg-accent-doux/40 md:border-b-0 md:border-r md:last:border-r-0 sm:p-7">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[10px] bg-accent-doux text-accent transition-transform duration-300 ease-depart group-hover:scale-110">{icon}</span>
      <div>
        <h3 className="font-heading font-bold text-navy">{title}</h3>
        <p className="mt-1.5 text-sm leading-6 text-texte-doux">{children}</p>
      </div>
    </div>
  );
}

function Step({ number, title, text }: { number: string; title: string; text: string }) {
  return (
    <li className="flex gap-4 p-7 transition-colors duration-300 ease-depart hover:bg-white/[0.04] sm:px-9 sm:py-8">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent text-sm font-bold">{number}</span>
      <div><p className="font-heading font-bold">{title}</p><p className="mt-1 text-sm text-white/58">{text}</p></div>
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
