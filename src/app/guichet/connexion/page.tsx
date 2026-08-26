import Image from "next/image";
import Link from "next/link";
import { FormulaireConnexion } from "./formulaire";
import { MobemboLogo } from "@/components/brand";

export default function ConnexionGuichet() {
  return (
    <section className="grid min-h-screen min-h-dvh w-full overflow-hidden bg-white lg:grid-cols-[0.9fr_1.1fr]">
      <div className="flex min-w-0 flex-col px-6 py-8 sm:px-10 sm:py-10 lg:px-14 lg:py-12">
        <Link href="/" className="group flex min-h-11 w-fit items-center gap-3 focus-visible:rounded-[10px] motion-reduce:transition-none" aria-label="Mobembo, retour à l'accueil">
          <MobemboLogo alt="" className="h-10 w-auto transition-transform duration-300 group-hover:-translate-y-0.5 motion-reduce:transform-none motion-reduce:transition-none" />
          <span className="hidden rounded bg-accent-doux px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-accent sm:inline-flex">Terminal agent</span>
        </Link>

        <div className="my-auto w-full max-w-[440px] py-10 sm:py-14">
          <p className="text-sm font-semibold text-accent">Espace professionnel</p>
          <h1 className="mt-2 text-3xl font-bold tracking-[-0.03em] text-navy sm:text-4xl">
            Bonjour, prêt pour le prochain départ&nbsp;?
          </h1>
          <p className="mt-3 max-w-md text-sm leading-6 text-texte-doux sm:text-base">
            Connectez-vous pour accéder au guichet, à la gérance, au contrôle ou au back-office.
          </p>

          <div className="mt-8">
            <FormulaireConnexion />
          </div>
        </div>

        <div className="flex items-start gap-3 border-t border-bordure pt-5 text-xs leading-5 text-texte-doux">
          <ShieldIcon />
          <p>
            Une seule fonction est active par session. Chaque changement de rôle est enregistré dans le journal d&apos;audit.
          </p>
        </div>
      </div>

      <div className="relative hidden min-h-[680px] overflow-hidden bg-navy lg:block">
        <Image
          src="/images/agent-guichet-mobembo.png"
          alt="Agente Mobembo devant des autocars au terminal"
          fill
          sizes="(min-width: 1280px) 640px, 55vw"
          className="object-cover object-center"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,22,45,0.78)_0%,rgba(8,22,45,0.22)_48%,rgba(8,22,45,0.72)_100%)]" />
        <div className="absolute inset-x-0 top-0 p-10 xl:p-14">
          <div className="max-w-lg rounded-[14px] bg-navy/90 p-7 text-white ring-1 ring-white/25 xl:p-9">
            <p className="text-sm font-semibold text-accent-clair">Le cœur des opérations</p>
            <h2 className="mt-3 text-4xl font-bold leading-[1.05] tracking-[-0.035em] text-balance xl:text-5xl">
              Chaque vente commence par une session sûre.
            </h2>
            <p className="mt-4 max-w-md text-sm leading-6 text-white/72">
              Vendez, synchronisez et préparez l&apos;embarquement depuis un terminal conçu pour les réalités de la gare.
            </p>
          </div>
        </div>
        <div className="absolute bottom-8 left-10 right-10 flex flex-wrap gap-2 text-xs font-semibold text-white xl:left-14 xl:right-14">
          <span className="rounded-full bg-navy/80 px-3 py-2 ring-1 ring-white/25">Mode hors-ligne</span>
          <span className="rounded-full bg-navy/80 px-3 py-2 ring-1 ring-white/25">Caisse traçable</span>
          <span className="rounded-full bg-navy/80 px-3 py-2 ring-1 ring-white/25">Accès par rôle</span>
        </div>
      </div>
    </section>
  );
}

function ShieldIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="mt-0.5 h-5 w-5 shrink-0 text-accent" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3 5 6v5c0 4.6 2.9 8.2 7 10 4.1-1.8 7-5.4 7-10V6l-7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}
