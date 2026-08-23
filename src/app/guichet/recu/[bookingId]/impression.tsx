"use client";

import { useEffect, useRef } from "react";
import { buttonClass } from "@/components/ui";

/**
 * Déclenchement de l'impression. Avec `?auto=1`, la boîte d'impression s'ouvre
 * dès l'arrivée : au guichet, la vente enchaîne sur l'impression, et un clic de
 * moins par passager compte quand la file s'allonge.
 */
export function BoutonImpression({ automatique }: { automatique: boolean }) {
  const dejaLance = useRef(false);

  useEffect(() => {
    if (!automatique || dejaLance.current) return;
    dejaLance.current = true;
    // Laisse le QR rendu par le serveur être peint avant d'ouvrir la boîte
    // d'impression, sinon certains navigateurs capturent une page vide.
    const minuteur = setTimeout(() => window.print(), 400);
    return () => clearTimeout(minuteur);
  }, [automatique]);

  return (
    <button type="button" className={buttonClass} onClick={() => window.print()}>
      Imprimer
    </button>
  );
}
