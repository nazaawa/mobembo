import Link from "next/link";
import { MODULE_DETAILS, type CompanyModule } from "@/lib/domain/modules";

/**
 * Écran d'un module non ouvert.
 *
 * Il ne dit jamais « accès refusé » : l'agence n'a rien fait de mal, elle n'en
 * est simplement pas là. §33 — une phase s'ouvre quand elle apporte de la
 * valeur, pas parce qu'elle figure sur une feuille de route. L'écran explique
 * donc ce que le module apporte, ce qu'il exige en retour, et comment le
 * demander.
 */
export function ModuleFerme({
  module,
  /** Le directeur peut demander l'ouverture ; un guichetier ou un contrôleur, non. */
  peutDemander = true,
  retourHref = "/backoffice",
  retourLabel = "Retour au tableau de bord",
}: {
  module: CompanyModule;
  peutDemander?: boolean;
  retourHref?: string;
  retourLabel?: string;
}) {
  const detail = MODULE_DETAILS[module];

  return (
    <div className="mx-auto max-w-2xl py-8">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-accent">
        Phase {detail.phase}
      </p>
      <h1 className="mt-2 font-heading text-3xl font-bold tracking-[-0.02em] text-navy">
        {detail.label}
      </h1>
      <p className="mt-3 text-base leading-7 text-texte-doux">
        Ce module n’est pas encore ouvert pour votre agence.{" "}
        {peutDemander
          ? "Vous n’en avez pas besoin pour être trouvé par les voyageurs — vos trajets publiés et vos réservations fonctionnent sans lui."
          : "La direction de votre agence peut en demander l’ouverture à l’équipe Mobembo."}
      </p>

      <dl className="mt-7 divide-y divide-bordure border-y border-bordure">
        <div className="grid gap-1 py-4 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-5">
          <dt className="text-xs font-bold uppercase tracking-[0.1em] text-texte-doux">
            Ce qu’il apporte
          </dt>
          <dd className="text-sm leading-6 text-texte">{detail.apport}</dd>
        </div>
        <div className="grid gap-1 py-4 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-5">
          <dt className="text-xs font-bold uppercase tracking-[0.1em] text-texte-doux">
            Ce qu’il demande
          </dt>
          <dd className="text-sm leading-6 text-texte">{detail.exigence}</dd>
        </div>
        <div className="grid gap-1 py-4 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-5">
          <dt className="text-xs font-bold uppercase tracking-[0.1em] text-texte-doux">
            Écrans ajoutés
          </dt>
          <dd className="text-sm leading-6 text-texte">{detail.ecrans.join(", ")}</dd>
        </div>
      </dl>

      <div className="mt-7 flex flex-wrap gap-3">
        {peutDemander && (
          <Link
            href="/backoffice/parametres"
            className="inline-flex min-h-12 items-center gap-2 rounded-[10px] bg-accent px-5 text-sm font-bold text-white transition hover:bg-accent-profond"
          >
            Demander l’ouverture <span aria-hidden>→</span>
          </Link>
        )}
        <Link
          href={retourHref}
          className="inline-flex min-h-12 items-center rounded-[10px] border border-bordure px-5 text-sm font-bold text-navy transition hover:border-accent hover:text-accent"
        >
          {retourLabel}
        </Link>
      </div>
    </div>
  );
}
