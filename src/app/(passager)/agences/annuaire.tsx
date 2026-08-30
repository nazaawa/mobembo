"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { activiteAgence } from "@/lib/domain/directory-format";
import type { DirectoryEntry } from "@/lib/domain/directory";
import { ContactAgence, LogoAgence, MiseAJour } from "@/components/offre";

/**
 * L'annuaire se lit en liste, pas en grille de cartes : une agence se compare
 * à une autre sur les mêmes colonnes — villes desservies, nombre d'horaires,
 * fraîcheur de l'information — et une grille casse cette lecture.
 */
export function AnnuaireAgences({
  agences,
  villes,
}: {
  agences: DirectoryEntry[];
  villes: string[];
}) {
  const [recherche, setRecherche] = useState("");
  const [ville, setVille] = useState("");
  const [reservationSeulement, setReservationSeulement] = useState(false);

  const affichees = useMemo(() => {
    const terme = recherche.trim().toLowerCase();
    return agences.filter((agence) => {
      const villesAgence = agence.villes ?? "";
      if (terme && !`${agence.name} ${villesAgence}`.toLowerCase().includes(terme)) return false;
      if (ville && !villesAgence.split(", ").includes(ville)) return false;
      if (reservationSeulement && agence.reservationEnLigne === 0) return false;
      return true;
    });
  }, [agences, recherche, reservationSeulement, ville]);

  return (
    <div className="mt-8">
      <div className="flex flex-col gap-3 rounded-[14px] border border-bordure bg-surface p-4 sm:flex-row sm:items-end">
        <label className="min-w-0 flex-1">
          <span className="mb-1.5 block text-xs font-semibold text-texte-doux">
            Chercher une agence ou une ville
          </span>
          <span className="flex min-h-12 items-center gap-2.5 rounded-[10px] bg-surface-alt px-3.5 outline outline-1 outline-transparent transition focus-within:bg-surface focus-within:outline-accent">
            <SearchGlyph />
            <input
              type="search"
              value={recherche}
              onChange={(event) => setRecherche(event.target.value)}
              placeholder="Trans-Kasaï, Matadi…"
              className="h-full w-full border-0 bg-transparent p-0 text-base font-medium text-texte outline-none placeholder:text-texte-doux"
            />
          </span>
        </label>

        <label className="sm:w-56">
          <span className="mb-1.5 block text-xs font-semibold text-texte-doux">Ville desservie</span>
          <select
            value={ville}
            onChange={(event) => setVille(event.target.value)}
            className="h-12 w-full rounded-[10px] bg-surface-alt px-3.5 text-base font-medium text-texte outline outline-1 outline-transparent transition focus:bg-surface focus:outline-accent"
          >
            <option value="">Toutes les villes</option>
            {villes.map((nom) => (
              <option key={nom} value={nom}>
                {nom}
              </option>
            ))}
          </select>
        </label>

        <label className="flex min-h-12 cursor-pointer items-center gap-2.5 text-sm font-medium text-navy sm:pb-3">
          <input
            type="checkbox"
            checked={reservationSeulement}
            onChange={() => setReservationSeulement((value) => !value)}
            className="champ-coche"
          />
          Réservation en ligne
        </label>
      </div>

      <p aria-live="polite" className="mt-5 text-sm text-texte-doux">
        {affichees.length} agence{affichees.length > 1 ? "s" : ""} sur {agences.length}
      </p>

      {affichees.length === 0 ? (
        <div className="mt-4 rounded-[14px] border border-dashed border-bordure bg-surface px-6 py-12 text-center">
          <h2 className="font-heading text-lg font-bold text-navy">Aucune agence ne correspond</h2>
          <p className="mt-1.5 text-sm text-texte-doux">
            Retirez un filtre, ou cherchez une autre ville.
          </p>
          <button
            type="button"
            onClick={() => {
              setRecherche("");
              setVille("");
              setReservationSeulement(false);
            }}
            className="mt-4 text-sm font-semibold text-accent hover:underline"
          >
            Réinitialiser la recherche
          </button>
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-bordure overflow-hidden rounded-[14px] border border-bordure bg-surface">
          {affichees.map((agence) => (
            <li key={agence.id} className="group transition-colors hover:bg-surface-alt/60">
              <div className="relative grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                <div className="flex min-w-0 gap-4">
                  <LogoAgence nom={agence.name} logo={agence.logo} taille={48} />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      <Link
                        href={`/agences/${agence.slug ?? agence.id}`}
                        className="font-heading text-lg font-bold text-navy after:absolute after:inset-0 after:content-[''] hover:text-accent"
                      >
                        {agence.name}
                      </Link>
                      {agence.kind === "INDEPENDANT" && (
                        <span className="rounded-md border border-bordure bg-surface-alt px-2 py-0.5 text-[11px] font-medium text-texte-doux">
                          Indépendant
                        </span>
                      )}
                      {agence.reservationEnLigne > 0 && (
                        <span className="rounded-md border border-accent/30 bg-accent-doux px-2 py-0.5 text-[11px] font-semibold text-accent">
                          Réservation en ligne
                        </span>
                      )}
                    </div>

                    <p className="mt-1 line-clamp-2 text-sm leading-6 text-texte-doux">
                      {agence.villes
                        ? `Dessert ${agence.villes}`
                        : "Villes desservies non encore publiées"}
                    </p>

                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                      <span className="text-xs font-semibold text-navy">{activiteAgence(agence)}</span>
                      {agence.derniereMiseAJour && <MiseAJour iso={agence.derniereMiseAJour} />}
                    </div>
                  </div>
                </div>

                {/* Les contacts échappent au lien de carte : ce sont des actions
                    distinctes, et un lien imbriqué dans un lien est invalide. */}
                <div className="relative z-10 lg:shrink-0">
                  <ContactAgence
                    telephone={agence.phone}
                    whatsapp={agence.whatsapp}
                    messageWhatsapp={`Bonjour ${agence.name}, je vous contacte depuis Mobembo au sujet d’un voyage.`}
                    compact
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SearchGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] shrink-0 text-texte-doux" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}
