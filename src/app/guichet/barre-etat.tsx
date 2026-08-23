"use client";

import { useCallback } from "react";
import { file } from "@/lib/client/offline";
import { useEnLigne, useStockageLocal } from "@/lib/client/store";

/**
 * §2.4 : le guichetier doit savoir en permanence s'il est en ligne et combien
 * de ventes attendent d'être synchronisées. Une file invisible est une file
 * qu'on oublie de vider.
 */
export function BarreEtat() {
  const enLigne = useEnLigne();
  const lireFile = useCallback(() => file().length, []);
  const enAttente = useStockageLocal(lireFile, 0);

  return (
    <span className="flex items-center gap-2 text-xs">
      <span
        className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-medium ${
          enLigne
            ? "border-succes/30 bg-succes-doux text-succes"
            : "border-attention/40 bg-attention-doux text-attention"
        }`}
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${enLigne ? "bg-succes" : "bg-attention"}`}
          aria-hidden
        />
        {enLigne ? "En ligne" : "Hors ligne"}
      </span>
      {enAttente > 0 && (
        <span className="rounded-md border border-attention/40 bg-attention-doux px-2 py-0.5 font-medium text-attention">
          {enAttente} vente{enAttente > 1 ? "s" : ""} à synchroniser
        </span>
      )}
    </span>
  );
}
