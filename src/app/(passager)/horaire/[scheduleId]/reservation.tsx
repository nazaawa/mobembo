"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatMoney } from "@/lib/core/money";
import { ContactAgence } from "@/components/offre";

/**
 * Phase 2 §10.2 — « Le voyageur renseigne : nom, téléphone, nombre de places. »
 *
 * Trois champs, un bouton, aucun compte à créer. Le SMS de confirmation fait
 * office de preuve : c'est le seul canal qui survit à un téléphone déchargé
 * (§30), et il porte la référence que l'agence sait retrouver.
 */
export function ReserverPlace({
  horaireId,
  compagnie,
  axe,
  heure,
  date,
  dateLisible,
  restantes,
  quota,
  prixUsd,
  prixCdf,
  telephone,
  whatsapp,
  paiementEnLigne,
}: {
  horaireId: string;
  compagnie: string;
  axe: string;
  heure: string;
  date: string;
  dateLisible: string;
  restantes: number;
  quota: number;
  prixUsd: number | null;
  prixCdf: number | null;
  telephone: string | null;
  whatsapp: string | null;
  /** Phase 3 ouverte pour cette agence : le paiement suit la réservation (§14.1). */
  paiementEnLigne: boolean;
}) {
  const router = useRouter();
  const [nom, setNom] = useState("");
  const [tel, setTel] = useState("");
  const [places, setPlaces] = useState(1);
  const [erreur, setErreur] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [reference, setReference] = useState<string | null>(null);
  const [reservationId, setReservationId] = useState<string | null>(null);

  const maximum = Math.min(5, Math.max(1, restantes));
  const total = prixUsd !== null ? prixUsd * places : prixCdf !== null ? prixCdf * places : null;
  const devise = prixUsd !== null ? "USD" : "CDF";

  if (reference) {
    return (
      <div className="rounded-[14px] border border-succes/30 bg-succes-doux p-5">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-succes text-white" aria-hidden>
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4">
              <path d="m5 13 4 4L19 7" />
            </svg>
          </span>
          <h2 className="font-heading text-xl font-bold text-succes">Place réservée</h2>
        </div>
        <p className="mt-3 text-sm leading-6 text-texte">
          {places} place{places > 1 ? "s" : ""} au nom de <strong className="font-semibold">{nom}</strong>{" "}
          sur le départ de {heure}, {dateLisible}.
        </p>
        <p className="mt-3 rounded-[10px] bg-surface px-3 py-2.5">
          <span className="block text-xs font-semibold text-texte-doux">Référence à donner à l’agence</span>
          <span className="mt-0.5 block select-all font-mono text-lg font-bold tracking-wider text-navy">
            {reference}
          </span>
        </p>
        <p className="mt-3 text-sm leading-6 text-texte-doux">
          Un SMS de confirmation part sur le {tel}.{" "}
          {paiementEnLigne
            ? `Vous pouvez payer maintenant par Mobile Money et recevoir votre billet numérique, ou régler ${compagnie} sur place.`
            : `Le paiement se fait auprès de ${compagnie}, sur place.`}{" "}
          Présentez-vous au point d’embarquement avant l’heure de départ.
        </p>
        <div className="mt-4 flex flex-col gap-2">
          {paiementEnLigne && reservationId && (
            <Link
              href={`/paiement/${reservationId}`}
              className="inline-flex min-h-12 items-center justify-center rounded-[10px] bg-accent px-4 text-sm font-bold text-white transition hover:bg-accent-profond"
            >
              Payer maintenant et recevoir mon billet
            </Link>
          )}
          <Link
            href="/mes-reservations"
            className="inline-flex min-h-12 items-center justify-center rounded-[10px] bg-navy px-4 text-sm font-bold text-white transition hover:bg-navy-profond"
          >
            Voir mes réservations
          </Link>
          <ContactAgence
            telephone={telephone}
            whatsapp={whatsapp}
            messageWhatsapp={`Bonjour ${compagnie}, réservation Mobembo ${reference} — ${axe}, ${dateLisible} à ${heure}, ${places} place(s).`}
            compact
          />
        </div>
      </div>
    );
  }

  if (restantes === 0) {
    return (
      <div className="rounded-[14px] border border-bordure bg-surface p-5">
        <h2 className="font-heading text-xl font-bold text-navy">Plus de place en ligne</h2>
        <p className="mt-2 text-sm leading-6 text-texte-doux">
          Les {quota} place{quota > 1 ? "s" : ""} que {compagnie} ouvre sur Mobembo pour ce départ
          sont prises. L’agence en garde d’autres à son guichet : appelez-la, ou choisissez une
          autre date.
        </p>
        <div className="mt-5">
          <ContactAgence
            telephone={telephone}
            whatsapp={whatsapp}
            messageWhatsapp={`Bonjour ${compagnie}, reste-t-il des places sur le départ ${axe} du ${dateLisible} à ${heure} ? (via Mobembo)`}
          />
        </div>
      </div>
    );
  }

  const soumettre = async () => {
    setErreur(null);
    setOccupe(true);
    try {
      const response = await fetch("/api/reservations-horaire", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ horaireId, date, nom, telephone: tel, places }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Réservation impossible.");
      setReference(data.reservation.reference);
      setReservationId(data.reservation.id);
      router.refresh();
    } catch (error) {
      setErreur((error as Error).message);
    } finally {
      setOccupe(false);
    }
  };

  return (
    <form
      className="rounded-[14px] border border-bordure bg-surface p-5 shadow-[0_10px_30px_rgba(8,22,45,0.06)]"
      onSubmit={(event) => {
        event.preventDefault();
        soumettre();
      }}
    >
      <h2 className="font-heading text-xl font-bold text-navy">Réserver ma place</h2>
      <p className="mt-1.5 text-sm leading-6 text-texte-doux">
        {restantes} place{restantes > 1 ? "s" : ""} encore libre{restantes > 1 ? "s" : ""} sur les{" "}
        {quota} ouvertes par {compagnie} pour le {dateLisible}.
      </p>

      {erreur && (
        <p
          role="alert"
          className="mt-4 rounded-[10px] border border-alerte/40 bg-alerte-doux px-3 py-2.5 text-sm leading-6 text-alerte"
        >
          {erreur}
        </p>
      )}

      <div className="mt-4 space-y-3.5">
        <Champ label="Nom du voyageur">
          <input
            required
            value={nom}
            autoComplete="name"
            onChange={(event) => setNom(event.target.value)}
            placeholder="Nom et prénom"
            className={champClass}
          />
        </Champ>

        <Champ label="Téléphone" aide="Vous recevrez la confirmation par SMS sur ce numéro.">
          <input
            required
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={tel}
            onChange={(event) => setTel(event.target.value)}
            placeholder="081 234 5678"
            className={champClass}
          />
        </Champ>

        <fieldset>
          <legend className="mb-1.5 text-xs font-semibold text-texte-doux">Nombre de places</legend>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Retirer une place"
              disabled={places <= 1}
              onClick={() => setPlaces((value) => Math.max(1, value - 1))}
              className="grid h-12 w-12 shrink-0 place-items-center rounded-[10px] border border-bordure text-navy transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M5 12h14" />
              </svg>
            </button>
            <output
              aria-live="polite"
              className="grid h-12 flex-1 place-items-center rounded-[10px] bg-surface-alt font-heading text-xl font-bold tabular-nums text-navy"
            >
              {places}
            </output>
            <button
              type="button"
              aria-label="Ajouter une place"
              disabled={places >= maximum}
              onClick={() => setPlaces((value) => Math.min(maximum, value + 1))}
              className="grid h-12 w-12 shrink-0 place-items-center rounded-[10px] border border-bordure text-navy transition hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          </div>
          {places >= maximum && (
            <p className="mt-1.5 text-[11px] text-texte-doux">
              {restantes <= 5
                ? `Maximum disponible sur ce départ.`
                : `Au-delà de 5 places, appelez l’agence directement.`}
            </p>
          )}
        </fieldset>
      </div>

      {total !== null && (
        <div className="mt-4 flex items-baseline justify-between border-t border-bordure pt-4">
          <span className="text-sm text-texte-doux">
            {paiementEnLigne ? "À payer" : "À payer sur place"}
            {places > 1 ? ` (${places} × ${formatMoney(total / places, devise)})` : ""}
          </span>
          <span className="font-heading text-xl font-bold tabular-nums text-navy">
            {formatMoney(total, devise)}
          </span>
        </div>
      )}

      <button
        type="submit"
        disabled={occupe || nom.trim().length < 2 || tel.trim().length < 9}
        className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[10px] bg-accent px-5 text-sm font-bold text-white transition duration-300 ease-depart hover:-translate-y-0.5 hover:bg-accent-profond disabled:cursor-not-allowed disabled:translate-y-0 disabled:bg-bordure disabled:text-texte-doux"
      >
        {occupe ? "Réservation en cours…" : "Réserver ma place"}
      </button>

      <p className="mt-3 text-[11px] leading-5 text-texte-doux">
        {paiementEnLigne
          ? `Réserver ne débite rien. Vous choisirez ensuite de payer par Mobile Money ou de régler ${compagnie} sur place.`
          : `Aucun paiement en ligne : vous réglez auprès de ${compagnie}.`}{" "}
        Votre place est retenue dès maintenant et vous pouvez l’annuler depuis « Mes réservations ».
      </p>
    </form>
  );
}

const champClass =
  "h-12 w-full rounded-[10px] bg-surface-alt px-3.5 text-base font-medium text-texte outline outline-1 " +
  "outline-transparent transition placeholder:font-normal placeholder:text-texte-doux " +
  "focus:bg-surface focus:outline-accent";

function Champ({
  label,
  aide,
  children,
}: {
  label: string;
  aide?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-texte-doux">{label}</span>
      {children}
      {aide && <span className="mt-1 block text-[11px] text-texte-doux">{aide}</span>}
    </label>
  );
}
