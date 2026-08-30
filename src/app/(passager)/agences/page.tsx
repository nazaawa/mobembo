import type { Metadata } from "next";
import Link from "next/link";
import { publicDirectory } from "@/lib/domain/directory";
import { AnnuaireAgences } from "./annuaire";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Les agences de transport interurbain — Mobembo",
  description:
    "Annuaire des agences de transport interurbain de la RDC : villes desservies, horaires publiés, téléphone et WhatsApp.",
};

/**
 * Phase 1 — §4.4 « Fiche agence ».
 *
 * L'annuaire est le service rendu avant toute réservation : savoir qui roule,
 * vers où, et comment le joindre. Une agence y figure gratuitement (§6), même
 * si elle ne vend rien en ligne — c'est précisément la promesse qui lui permet
 * de rejoindre Mobembo sans rien changer à son fonctionnement.
 */
export default async function Agences() {
  const agences = await publicDirectory();
  const villes = [
    ...new Set(agences.flatMap((agence) => (agence.villes ?? "").split(", ").filter(Boolean))),
  ].sort((a, b) => a.localeCompare(b, "fr"));

  return (
    <div className="pb-4">
      <header className="max-w-3xl border-b border-bordure pb-8">
        <h1 className="font-heading text-3xl font-bold tracking-[-0.02em] text-navy sm:text-5xl">
          Les agences qui font la route
        </h1>
        <p className="mt-4 text-base leading-7 text-texte-doux">
          {agences.length > 0
            ? `${agences.length} agence${agences.length > 1 ? "s" : ""} référencée${agences.length > 1 ? "s" : ""} sur Mobembo. Chacune publie ses villes, ses horaires et ses tarifs, et reste joignable directement.`
            : "Les premières agences apparaîtront ici dès leur référencement."}
        </p>
      </header>

      {agences.length === 0 ? (
        <div className="mt-8 rounded-[14px] border border-dashed border-bordure bg-surface px-6 py-12 text-center">
          <h2 className="font-heading text-xl font-bold text-navy">L’annuaire est en construction</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-texte-doux">
            Le référencement est gratuit et n’engage à rien : une agence peut publier ses horaires
            sans changer sa façon de vendre ses billets.
          </p>
          <Link
            href="/partenaires/inscription"
            className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-[10px] bg-accent px-5 text-sm font-bold text-white transition hover:bg-accent-profond"
          >
            Référencer mon agence <span aria-hidden>→</span>
          </Link>
        </div>
      ) : (
        <AnnuaireAgences agences={agences} villes={villes} />
      )}
    </div>
  );
}
