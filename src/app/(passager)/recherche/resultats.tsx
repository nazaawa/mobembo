"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { SearchResult } from "@/lib/domain/planning";
import { Badge, Money } from "@/components/ui";

type Periode = "TOUS" | "MATIN" | "APRES_MIDI" | "SOIR";
type Tri = "DEPART" | "PRIX" | "PLACES";

export function ResultatsTrajets({ resultats }: { resultats: SearchResult[] }) {
  const categories = Array.from(new Set(resultats.map((trajet) => trajet.categorie)));
  const [selectionCategories, setSelectionCategories] = useState<string[]>(categories);
  const [periode, setPeriode] = useState<Periode>("TOUS");
  const [disponiblesSeulement, setDisponiblesSeulement] = useState(true);
  const [tri, setTri] = useState<Tri>("DEPART");

  const affiches = useMemo(() => {
    const filtres = resultats.filter((trajet) => {
      const heure = new Date(trajet.depart).getHours();
      const places = trajet.placesEnLigne + trajet.placesRemisesEnVente;
      const bonnePeriode =
        periode === "TOUS" ||
        (periode === "MATIN" && heure < 12) ||
        (periode === "APRES_MIDI" && heure >= 12 && heure < 18) ||
        (periode === "SOIR" && heure >= 18);
      return (
        selectionCategories.includes(trajet.categorie) &&
        bonnePeriode &&
        (!disponiblesSeulement || places > 0)
      );
    });

    return [...filtres].sort((a, b) => {
      if (tri === "PRIX") return a.prixUsd - b.prixUsd;
      if (tri === "PLACES") {
        return b.placesEnLigne + b.placesRemisesEnVente - (a.placesEnLigne + a.placesRemisesEnVente);
      }
      return new Date(a.depart).getTime() - new Date(b.depart).getTime();
    });
  }, [disponiblesSeulement, periode, resultats, selectionCategories, tri]);

  const filtres = (
    <div className="space-y-6">
      <FilterSection title="Catégorie">
        {categories.map((categorie) => (
          <CheckFilter
            key={categorie}
            checked={selectionCategories.includes(categorie)}
            label={categorie}
            onChange={() =>
              setSelectionCategories((current) =>
                current.includes(categorie)
                  ? current.filter((item) => item !== categorie)
                  : [...current, categorie],
              )
            }
          />
        ))}
      </FilterSection>

      <FilterSection title="Heure de départ">
        {([
          ["TOUS", "Toute la journée"],
          ["MATIN", "Matin · avant 12 h"],
          ["APRES_MIDI", "Après-midi · 12–18 h"],
          ["SOIR", "Soir · après 18 h"],
        ] as const).map(([value, label]) => (
          <label key={value} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
            <input
              type="radio"
              name="periode"
              value={value}
              checked={periode === value}
              onChange={() => setPeriode(value)}
              className="h-4 w-4 accent-accent"
            />
            {label}
          </label>
        ))}
      </FilterSection>

      <FilterSection title="Disponibilité">
        <CheckFilter
          checked={disponiblesSeulement}
          label="Places disponibles"
          onChange={() => setDisponiblesSeulement((value) => !value)}
        />
      </FilterSection>

      <button
        type="button"
        className="text-sm font-semibold text-accent hover:underline"
        onClick={() => {
          setSelectionCategories(categories);
          setPeriode("TOUS");
          setDisponiblesSeulement(true);
        }}
      >
        Réinitialiser les filtres
      </button>
    </div>
  );

  return (
    <div className="grid gap-5 lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start">
      <aside className="hidden rounded-[14px] border border-bordure bg-surface p-5 lg:block lg:sticky lg:top-24">
        <h2 className="font-heading text-lg font-bold text-navy">Filtrer les départs</h2>
        <div className="mt-5">{filtres}</div>
      </aside>

      <section aria-label="Liste des départs" className="min-w-0 space-y-4">
        <details className="rounded-[14px] border border-bordure bg-surface p-4 lg:hidden">
          <summary className="cursor-pointer font-semibold text-navy">Filtres</summary>
          <div className="mt-4 border-t border-bordure pt-4">{filtres}</div>
        </details>

        <div className="flex flex-col gap-3 rounded-[14px] border border-bordure bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-semibold text-navy">
            {affiches.length} option{affiches.length > 1 ? "s" : ""} correspondante{affiches.length > 1 ? "s" : ""}
          </p>
          <label className="flex items-center gap-2 text-sm text-texte-doux">
            Trier par
            <select
              value={tri}
              onChange={(event) => setTri(event.target.value as Tri)}
              className="min-h-11 rounded-[10px] border border-bordure bg-surface px-3 font-medium text-texte outline-none focus:border-accent"
            >
              <option value="DEPART">Départ le plus tôt</option>
              <option value="PRIX">Prix le plus bas</option>
              <option value="PLACES">Plus de places</option>
            </select>
          </label>
        </div>

        {affiches.length === 0 ? (
          <div className="rounded-[14px] border border-dashed border-bordure bg-surface px-6 py-12 text-center">
            <h3 className="font-semibold text-navy">Aucun départ avec ces filtres</h3>
            <p className="mt-1 text-sm text-texte-doux">Élargissez une catégorie ou une plage horaire.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {affiches.map((trajet) => <Resultat key={trajet.tripId} trajet={trajet} />)}
          </ul>
        )}
      </section>
    </div>
  );
}

function Resultat({ trajet }: { trajet: SearchResult }) {
  const places = trajet.placesEnLigne + trajet.placesRemisesEnVente;
  const arrivee = trajet.dureeEstimeeMin
    ? new Date(new Date(trajet.depart).getTime() + trajet.dureeEstimeeMin * 60_000)
    : null;
  const heure = new Intl.DateTimeFormat("fr-CD", { hour: "2-digit", minute: "2-digit" });

  return (
    <li className="rounded-[14px] border border-bordure bg-surface p-4 shadow-[0_4px_16px_rgba(8,22,45,0.04)] transition hover:border-accent/45 hover:shadow-[0_12px_30px_rgba(8,22,45,0.08)] sm:p-5">
      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-navy">{trajet.compagnie}</p>
            <Badge tone={trajet.categorie === "VIP" ? "accent" : "neutre"}>{trajet.categorie}</Badge>
            {trajet.placesRemisesEnVente > 0 && (
              <Badge tone="attention">{trajet.placesRemisesEnVente} en revente</Badge>
            )}
          </div>

          <div className="mt-4 grid grid-cols-[auto_minmax(4rem,1fr)_auto] items-center gap-3">
            <div>
              <p className="text-2xl font-bold tabular-nums text-navy">{heure.format(new Date(trajet.depart))}</p>
              <p className="text-xs text-texte-doux">{trajet.origine}</p>
            </div>
            <div className="text-center">
              <p className="text-[11px] text-texte-doux">
                {trajet.dureeEstimeeMin ? duree(trajet.dureeEstimeeMin) : "Durée à confirmer"}
              </p>
              <div className="my-1 flex items-center gap-1.5" aria-hidden>
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                <span className="h-px flex-1 bg-bordure" />
                <BusIcon />
                <span className="h-px flex-1 bg-bordure" />
                <span className="h-1.5 w-1.5 rounded-full bg-navy" />
              </div>
              <p className="text-[11px] text-texte-doux">Direct</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold tabular-nums text-navy">{arrivee ? heure.format(arrivee) : "—"}</p>
              <p className="text-xs text-texte-doux">{trajet.destination}</p>
            </div>
          </div>
        </div>

        <div className="border-t border-bordure pt-4 md:min-w-44 md:border-l md:border-t-0 md:pl-5 md:pt-0 md:text-right">
          <p className="text-xs text-texte-doux">À partir de</p>
          <p className="mt-0.5 text-xl font-bold text-navy"><Money amount={trajet.prixUsd} currency="USD" /></p>
          <p className="text-xs text-texte-doux"><Money amount={trajet.prixCdf} currency="CDF" /></p>
          <p className={`mt-2 text-xs font-medium ${places <= 5 ? "text-attention" : "text-succes"}`}>
            {places > 0 ? `${places} place${places > 1 ? "s" : ""} disponible${places > 1 ? "s" : ""}` : "Complet en ligne"}
          </p>
          <Link
            href={`/trajet/${trajet.tripId}`}
            className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-[10px] bg-accent px-4 text-sm font-bold text-white transition hover:bg-accent-profond"
          >
            {places > 0 ? "Choisir mes sièges" : "Voir le plan"}
          </Link>
        </div>
      </div>
    </li>
  );
}

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend className="mb-2 text-xs font-bold uppercase tracking-[0.1em] text-texte-doux">{title}</legend>
      <div className="space-y-0.5">{children}</div>
    </fieldset>
  );
}

function CheckFilter({ checked, label, onChange }: { checked: boolean; label: string; onChange: () => void }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
      <input type="checkbox" checked={checked} onChange={onChange} className="h-4 w-4 rounded accent-accent" />
      {label}
    </label>
  );
}

function duree(minutes: number) {
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")}`;
}

function BusIcon() {
  return <svg viewBox="0 0 24 24" className="h-4 w-4 text-accent" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="5" y="3" width="14" height="16" rx="3"/><path d="M7 7h10M8 16h8M8 21v-2M16 21v-2"/><circle cx="8" cy="13" r="1"/><circle cx="16" cy="13" r="1"/></svg>;
}
