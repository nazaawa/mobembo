"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { BookingMode, TravelOffer } from "@/lib/domain/offers";
import { formatTime, hourInKinshasa } from "@/lib/core/time";
import { ContactAgence, MiseAJour, ModeReservation, PrixOffre } from "@/components/offre";

type Periode = "TOUS" | "MATIN" | "APRES_MIDI" | "SOIR";
type Tri = "DEPART" | "PRIX" | "PLACES";

const MODES: Array<{ value: BookingMode; label: string }> = [
  { value: "SIEGE", label: "Siège et paiement en ligne" },
  { value: "PLACES", label: "Réservation en ligne" },
  { value: "CONTACT", label: "Contact avec l’agence" },
];

/**
 * Une seule liste de départs, deux niveaux de service.
 *
 * Le filtre « ce que je peux faire » remplace l'ancien filtre de catégorie de
 * bus : sur un axe où une compagnie vend en ligne et trois autres publient
 * seulement leurs horaires, c'est la question que se pose réellement le
 * voyageur avant de cliquer.
 */
export function ResultatsTrajets({ resultats }: { resultats: TravelOffer[] }) {
  const modesPresents = MODES.filter((mode) =>
    resultats.some((offre) => offre.bookingMode === mode.value),
  );
  const [modes, setModes] = useState<BookingMode[]>(modesPresents.map((mode) => mode.value));
  const [periode, setPeriode] = useState<Periode>("TOUS");
  const [tri, setTri] = useState<Tri>("DEPART");

  const affiches = useMemo(() => {
    const filtres = resultats.filter((offre) => {
      const heure = hourInKinshasa(offre.depart);
      const bonnePeriode =
        periode === "TOUS" ||
        (periode === "MATIN" && heure < 12) ||
        (periode === "APRES_MIDI" && heure >= 12 && heure < 18) ||
        (periode === "SOIR" && heure >= 18);
      return modes.includes(offre.bookingMode) && bonnePeriode;
    });

    return [...filtres].sort((a, b) => {
      if (tri === "PRIX") {
        return (a.prixUsd ?? Number.MAX_SAFE_INTEGER) - (b.prixUsd ?? Number.MAX_SAFE_INTEGER);
      }
      if (tri === "PLACES") {
        return (b.placesDisponibles ?? -1) - (a.placesDisponibles ?? -1);
      }
      return new Date(a.depart).getTime() - new Date(b.depart).getTime();
    });
  }, [modes, periode, resultats, tri]);

  // Rendu deux fois (panneau desktop + <details> mobile) : le `name` du radio
  // doit varier entre les deux copies, sinon le navigateur les traite comme
  // un seul groupe natif et décoche silencieusement l'une des deux quand
  // React coche l'autre.
  const filtres = (idSuffix: string) => (
    <div className="space-y-6">
      <FilterSection title="Réservation">
        {modesPresents.map((mode) => (
          <CheckFilter
            key={mode.value}
            checked={modes.includes(mode.value)}
            label={mode.label}
            onChange={() =>
              setModes((current) =>
                current.includes(mode.value)
                  ? current.filter((item) => item !== mode.value)
                  : [...current, mode.value],
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
              name={`periode-${idSuffix}`}
              value={value}
              checked={periode === value}
              onChange={() => setPeriode(value)}
              className="champ-coche"
            />
            {label}
          </label>
        ))}
      </FilterSection>

      <button
        type="button"
        className="text-sm font-semibold text-accent hover:underline"
        onClick={() => {
          setModes(modesPresents.map((mode) => mode.value));
          setPeriode("TOUS");
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
        <div className="mt-5">{filtres("desktop")}</div>
      </aside>

      <section aria-label="Liste des départs" className="min-w-0 space-y-4">
        <details className="rounded-[14px] border border-bordure bg-surface p-4 lg:hidden">
          <summary className="cursor-pointer font-semibold text-navy">Filtres</summary>
          <div className="mt-4 border-t border-bordure pt-4">{filtres("mobile")}</div>
        </details>

        <div className="flex flex-col gap-3 rounded-[14px] border border-bordure bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p aria-live="polite" className="text-sm font-semibold text-navy">
            {affiches.length} départ{affiches.length > 1 ? "s" : ""} affiché{affiches.length > 1 ? "s" : ""}
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
            <h3 className="font-heading font-bold text-navy">Aucun départ avec ces filtres</h3>
            <p className="mt-1 text-sm text-texte-doux">
              Rouvrez un mode de réservation ou élargissez la plage horaire.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {affiches.map((offre) => (
              <Resultat key={`${offre.kind}-${offre.id}`} offre={offre} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Resultat({ offre }: { offre: TravelOffer }) {
  const arrivee = offre.dureeEstimeeMin
    ? new Date(new Date(offre.depart).getTime() + offre.dureeEstimeeMin * 60_000).toISOString()
    : null;
  const places = (offre.placesDisponibles ?? 0) + offre.placesRemisesEnVente;

  return (
    <li className="rounded-[14px] border border-bordure bg-surface p-4 shadow-[0_4px_16px_rgba(8,22,45,0.04)] transition hover:border-accent/45 hover:shadow-[0_12px_30px_rgba(8,22,45,0.08)] sm:p-5">
      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {offre.companySlug ? (
              <Link href={`/agences/${offre.companySlug}`} className="font-semibold text-navy hover:text-accent">
                {offre.compagnie}
              </Link>
            ) : (
              <p className="font-semibold text-navy">{offre.compagnie}</p>
            )}
            <ModeReservation mode={offre.bookingMode} />
            {offre.categorie === "VIP" && (
              <span className="rounded-md border border-accent/30 bg-accent-doux px-2 py-0.5 text-[11px] font-semibold text-accent">
                VIP
              </span>
            )}
            {offre.vehiculeType === "VOITURE" && (
              <span className="rounded-md border border-attention/30 bg-attention-doux px-2 py-0.5 text-[11px] font-medium text-attention">
                {offre.vehiculeLabel ?? "Voiture express"}
              </span>
            )}
            {offre.placesRemisesEnVente > 0 && (
              <span className="rounded-md border border-attention/30 bg-attention-doux px-2 py-0.5 text-[11px] font-medium text-attention">
                {offre.placesRemisesEnVente} en revente
              </span>
            )}
          </div>

          <div className="mt-4 grid grid-cols-[auto_minmax(4rem,1fr)_auto] items-center gap-3">
            <div>
              <p className="font-heading text-2xl font-bold tabular-nums text-navy">
                {formatTime(offre.depart)}
              </p>
              <p className="text-xs text-texte-doux">{offre.origine}</p>
            </div>
            <div className="text-center">
              <p className="text-[11px] text-texte-doux">
                {offre.dureeEstimeeMin ? duree(offre.dureeEstimeeMin) : "Durée à confirmer"}
              </p>
              <div className="my-1 flex items-center gap-1.5" aria-hidden>
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                <span className="h-px flex-1 bg-bordure" />
                {offre.vehiculeType === "VOITURE" ? <CarIcon /> : <BusIcon />}
                <span className="h-px flex-1 bg-bordure" />
                <span className="h-1.5 w-1.5 rounded-full bg-navy" />
              </div>
              <p className="text-[11px] text-texte-doux">Direct</p>
            </div>
            <div className="text-right">
              <p className="font-heading text-2xl font-bold tabular-nums text-navy">
                {arrivee ? formatTime(arrivee) : "—"}
              </p>
              <p className="text-xs text-texte-doux">{offre.destination}</p>
            </div>
          </div>

          {offre.pointEmbarquement && (
            <p className="mt-3 text-sm text-texte-doux">
              <span className="font-semibold text-navy">Départ :</span> {offre.pointEmbarquement}
            </p>
          )}

          {offre.misAJour ? (
            <div className="mt-2.5">
              <MiseAJour iso={offre.misAJour} />
            </div>
          ) : (
            <p className="mt-2.5 text-xs text-texte-doux">Disponibilité en temps réel</p>
          )}
        </div>

        <div className="border-t border-bordure pt-4 md:min-w-48 md:border-l md:border-t-0 md:pl-5 md:pt-0">
          <div className="md:text-right">
            <PrixOffre usd={offre.prixUsd} cdf={offre.prixCdf} indicatif={offre.prixIndicatif} />
          </div>

          <p className="mt-2 text-xs font-medium md:text-right">
            {offre.bookingMode === "CONTACT" ? (
              <span className="text-texte-doux">Places gérées par l’agence</span>
            ) : places > 0 ? (
              <span className={places <= 5 ? "text-attention" : "text-succes"}>
                {places} place{places > 1 ? "s" : ""} en ligne
                {offre.placesOffertes !== null && ` sur ${offre.placesOffertes}`}
              </span>
            ) : (
              <span className="text-texte-doux">Complet en ligne</span>
            )}
          </p>

          <Link
            href={offre.href}
            className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-[10px] bg-accent px-4 text-sm font-bold text-white transition hover:bg-accent-profond"
          >
            {offre.bookingMode === "SIEGE"
              ? places > 0
                ? "Choisir mes sièges"
                : "Voir le plan"
              : offre.bookingMode === "PLACES"
                ? places > 0
                  ? "Réserver une place"
                  : "Voir le départ"
                : "Voir le départ"}
          </Link>

          {offre.bookingMode === "CONTACT" && (offre.companyPhone || offre.companyWhatsapp) && (
            <div className="mt-2">
              <ContactAgence
                telephone={offre.companyPhone}
                whatsapp={offre.companyWhatsapp}
                messageWhatsapp={`Bonjour ${offre.compagnie}, je souhaite réserver une place sur le départ ${offre.origine} → ${offre.destination} de ${formatTime(offre.depart)}. (via Mobembo)`}
                compact
              />
            </div>
          )}
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
      <input type="checkbox" checked={checked} onChange={onChange} className="champ-coche" />
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

function CarIcon() {
  return <svg viewBox="0 0 24 24" className="h-4 w-4 text-accent" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 16V12l2-5h12l2 5v4"/><path d="M4 16h16M6 16v2M18 16v2"/><circle cx="7.5" cy="16" r="1.4"/><circle cx="16.5" cy="16" r="1.4"/></svg>;
}
