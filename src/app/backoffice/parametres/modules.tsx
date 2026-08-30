"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  COMPANY_MODULES,
  MODULE_DETAILS,
  type CompanyModule,
} from "@/lib/domain/modules";

/**
 * Le panneau de phases du directeur.
 *
 * Deux choses distinctes, et l'écran doit les garder distinctes : ce que
 * Mobembo a ouvert (l'agence ne décide pas seule d'entrer en phase 4), et ce
 * que le directeur affiche parmi cela. Le second est un interrupteur immédiat,
 * le premier est une demande.
 */
export function PanneauModules({
  modules,
  vueComplete,
  telephoneMobembo,
}: {
  modules: CompanyModule[];
  vueComplete: boolean;
  /** Numéro d'assistance, s'il est configuré. Jamais inventé. */
  telephoneMobembo: string | null;
}) {
  const router = useRouter();
  const [actif, setActif] = useState(vueComplete);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const ouverts = COMPANY_MODULES.filter((module) => modules.includes(module));
  const fermes = COMPANY_MODULES.filter((module) => !modules.includes(module));
  // Sans module avancé, l'interrupteur n'aurait rien à révéler : le proposer
  // ferait croire à une fonction cassée.
  const aQuelqueChoseAAfficher = ouverts.some((module) => module !== "RESERVATION");

  const basculer = async (valeur: boolean) => {
    setErreur(null);
    setOccupe(true);
    setActif(valeur);
    try {
      const response = await fetch("/api/backoffice/vue", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ vueComplete: valeur }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Changement impossible.");
      router.refresh();
    } catch (error) {
      setActif(!valeur);
      setErreur((error as Error).message);
    } finally {
      setOccupe(false);
    }
  };

  return (
    <div className="space-y-5">
      {erreur && (
        <p role="alert" className="rounded-lg border border-alerte/40 bg-alerte-doux px-3 py-2 text-sm text-alerte">
          {erreur}
        </p>
      )}

      {/* Un interrupteur désactivé qui a l'air allumé ment sur l'état du produit :
          tant qu'aucun module avancé n'est ouvert, il n'y a pas d'interrupteur. */}
      {aQuelqueChoseAAfficher ? (
        <div className="rounded-lg border border-bordure bg-surface-alt/40 p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-xl">
              <p className="font-semibold text-navy">Vue complète</p>
              <p className="mt-1 text-sm leading-6 text-texte-doux">
                Affiche tous les modules ouverts pour votre agence. Désactivez-la pour revenir à
                l’essentiel — trajets publiés, réservations, fiche publique — sans rien perdre :
                vos données, vos ventes et vos billets continuent de fonctionner.
              </p>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={actif}
              aria-label="Vue complète"
              disabled={occupe}
              onClick={() => basculer(!actif)}
              className={`relative inline-flex h-11 w-[4.75rem] shrink-0 items-center rounded-full border px-1 transition-colors duration-300 ease-depart disabled:cursor-not-allowed disabled:opacity-45 ${
                actif ? "border-accent bg-accent" : "border-bordure bg-surface"
              }`}
            >
              <span
                className={`h-8 w-8 rounded-full bg-white shadow-[0_2px_6px_rgba(8,22,45,0.25)] transition-transform duration-300 ease-depart ${
                  actif ? "translate-x-[2.15rem]" : "translate-x-0"
                }`}
              />
              <span className="sr-only">{actif ? "activée" : "désactivée"}</span>
            </button>
          </div>
        </div>
      ) : (
        <p className="rounded-lg border border-bordure bg-surface-alt/40 p-4 text-sm leading-6 text-texte-doux">
          Votre back-office affiche aujourd’hui l’essentiel :{" "}
          {ouverts.length === 0
            ? "vos trajets publiés et votre fiche publique"
            : "vos trajets publiés, vos réservations et votre fiche publique"}
          . Un interrupteur d’affichage apparaîtra ici dès qu’une phase supplémentaire sera ouverte.
        </p>
      )}

      <div>
        <h3 className="text-xs font-bold uppercase tracking-[0.1em] text-texte-doux">
          Phases ouvertes pour votre agence
        </h3>
        <ul className="mt-3 divide-y divide-bordure border-y border-bordure">
          <LigneModule
            titre="Référencement et recherche"
            phase={1}
            etat="ouvert"
            apport="Vos trajets, tarifs et coordonnées apparaissent dans la recherche et l’annuaire."
          />
          {ouverts.map((module) => (
            <LigneModule
              key={module}
              titre={MODULE_DETAILS[module].label}
              phase={MODULE_DETAILS[module].phase}
              etat={actif || module === "RESERVATION" ? "ouvert" : "masque"}
              apport={MODULE_DETAILS[module].apport}
            />
          ))}
          {fermes.map((module) => (
            <LigneModule
              key={module}
              titre={MODULE_DETAILS[module].label}
              phase={MODULE_DETAILS[module].phase}
              etat="ferme"
              apport={MODULE_DETAILS[module].apport}
              exigence={MODULE_DETAILS[module].exigence}
            />
          ))}
        </ul>
      </div>

      {fermes.length > 0 && (
        <p className="text-sm leading-6 text-texte-doux">
          Une phase s’ouvre quand vous en avez l’usage, pas avant. Pour demander l’ouverture de
          l’une d’elles, contactez l’équipe Mobembo
          {telephoneMobembo && (
            <>
              {" "}au{" "}
              <a href={`tel:${telephoneMobembo}`} className="font-semibold text-accent hover:underline">
                {telephoneMobembo}
              </a>
            </>
          )}{" "}
          — elle vous expliquera ce que cela change dans votre organisation avant de l’activer.
        </p>
      )}
    </div>
  );
}

function LigneModule({
  titre,
  phase,
  etat,
  apport,
  exigence,
}: {
  titre: string;
  phase: number;
  etat: "ouvert" | "masque" | "ferme";
  apport: string;
  exigence?: string;
}) {
  const badge = {
    ouvert: { texte: "Ouvert", classe: "border-succes/30 bg-succes-doux text-succes" },
    masque: { texte: "Ouvert · masqué", classe: "border-attention/30 bg-attention-doux text-attention" },
    ferme: { texte: "Non ouvert", classe: "border-bordure bg-surface-alt text-texte-doux" },
  }[etat];

  return (
    <li className="grid gap-2 py-4 sm:grid-cols-[minmax(0,1fr)_9rem] sm:items-start sm:gap-5">
      <div className={etat === "ferme" ? "opacity-70" : undefined}>
        <p className="font-semibold text-navy">
          {titre}
          <span className="ml-2 text-xs font-medium text-texte-doux">Phase {phase}</span>
        </p>
        <p className="mt-1 text-sm leading-6 text-texte-doux">{apport}</p>
        {exigence && (
          <p className="mt-1 text-sm leading-6 text-texte-doux">
            <span className="font-medium text-navy">Demande en retour :</span> {exigence}
          </p>
        )}
      </div>
      <span
        className={`inline-flex w-fit items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold sm:justify-self-end ${badge.classe}`}
      >
        {badge.texte}
      </span>
    </li>
  );
}
