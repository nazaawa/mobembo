"use client";

import { useState } from "react";

/**
 * §14.5 : « Le billet peut être partagé ou présenté depuis le téléphone du
 * voyageur. »
 *
 * Trois chemins, du plus utile au plus universel : le partage natif Android
 * (`navigator.share`, présent sur Chrome Android, la cible du produit), la
 * copie du résumé, et l'impression. Le bouton natif n'apparaît que si le
 * navigateur le propose — un bouton qui ne fait rien vaut moins que pas de
 * bouton.
 */
export function PartagerBillet({ code, resume }: { code: string; resume: string }) {
  const [copie, setCopie] = useState(false);
  const [partageDisponible] = useState(
    () => typeof navigator !== "undefined" && typeof navigator.share === "function",
  );

  const bouton =
    "inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-[10px] border px-4 text-sm font-bold transition";

  return (
    <div className="rounded-[14px] border border-bordure bg-surface p-5">
      <h2 className="text-xs font-bold uppercase tracking-[0.1em] text-texte-doux">
        Partager ce billet
      </h2>
      <p className="mt-2 text-sm leading-6 text-texte-doux">
        Le voyageur peut présenter ce billet depuis son téléphone. Le code{" "}
        <span className="font-mono font-semibold text-navy">{code}</span> suffit si l’écran est
        illisible au soleil.
      </p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        {partageDisponible && (
          <button
            type="button"
            className={`${bouton} border-navy bg-navy text-white hover:bg-navy-profond`}
            onClick={() => {
              navigator.share({ title: `Billet Mobembo ${code}`, text: resume }).catch(() => {
                // Partage annulé par le voyageur : rien à signaler.
              });
            }}
          >
            <ShareGlyph />
            Partager
          </button>
        )}
        <button
          type="button"
          className={`${bouton} border-bordure bg-surface text-navy hover:border-accent hover:text-accent`}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(resume);
              setCopie(true);
              setTimeout(() => setCopie(false), 2500);
            } catch {
              setCopie(false);
            }
          }}
        >
          <CopyGlyph />
          {copie ? "Copié" : "Copier les informations"}
        </button>
        <button
          type="button"
          className={`${bouton} border-bordure bg-surface text-navy hover:border-accent hover:text-accent`}
          onClick={() => window.print()}
        >
          <PrintGlyph />
          Imprimer
        </button>
      </div>
      <p aria-live="polite" className="sr-only">
        {copie ? "Informations du billet copiées." : ""}
      </p>
    </div>
  );
}

function ShareGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="m8.6 13.5 6.8 4M15.4 6.5 8.6 10.5" />
    </svg>
  );
}

function CopyGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  );
}

function PrintGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M7 9V3h10v6M7 19H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" />
      <rect x="7" y="15" width="10" height="6" />
    </svg>
  );
}
