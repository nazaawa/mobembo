"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * §12 : « Une réservation expirée libère automatiquement la place. » Une
 * réservation annulée aussi — d'où la confirmation en deux temps plutôt qu'une
 * boîte de dialogue : l'annulation rend la place à l'agence immédiatement et
 * ne se reprend pas.
 */
export function AnnulerReservation({
  reservationId,
  reference,
}: {
  reservationId: string;
  reference: string;
}) {
  const router = useRouter();
  const [confirme, setConfirme] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const annuler = async () => {
    setErreur(null);
    setOccupe(true);
    try {
      const response = await fetch(`/api/reservations-horaire/${reservationId}/annulation`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Annulation impossible.");
      router.refresh();
    } catch (error) {
      setErreur((error as Error).message);
      setOccupe(false);
    }
  };

  if (erreur) {
    return (
      <p role="alert" className="rounded-[10px] bg-alerte-doux px-3 py-2 text-left text-sm leading-6 text-alerte">
        {erreur}
      </p>
    );
  }

  if (!confirme) {
    return (
      <button
        type="button"
        onClick={() => setConfirme(true)}
        className="inline-flex min-h-11 w-full items-center justify-center rounded-[10px] border border-bordure px-3 text-sm font-semibold text-texte-doux transition hover:border-alerte hover:text-alerte"
      >
        Annuler cette réservation
      </button>
    );
  }

  return (
    <div className="rounded-[10px] border border-alerte/30 bg-alerte-doux p-3 text-left">
      <p className="text-sm leading-6 text-alerte">
        Libérer la place réservée sous la référence {reference} ?
      </p>
      <div className="mt-2.5 flex gap-2">
        <button
          type="button"
          disabled={occupe}
          onClick={annuler}
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-[10px] bg-alerte px-3 text-sm font-bold text-white transition hover:brightness-110 disabled:opacity-60"
        >
          {occupe ? "Annulation…" : "Oui, annuler"}
        </button>
        <button
          type="button"
          disabled={occupe}
          onClick={() => setConfirme(false)}
          className="inline-flex min-h-11 items-center justify-center rounded-[10px] border border-bordure bg-surface px-3 text-sm font-semibold text-navy transition hover:bg-surface-alt"
        >
          Garder
        </button>
      </div>
    </div>
  );
}
