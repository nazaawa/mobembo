"use client";

import { useCallback, useRef, useSyncExternalStore } from "react";

/**
 * Pont entre le stockage local (file de ventes, manifestes, scans) et React.
 *
 * `localStorage` est un magasin mutable extérieur à React : le lire dans un
 * `useEffect` puis appeler `setState` provoque un rendu en cascade et une
 * incohérence pendant l'hydratation. `useSyncExternalStore` est fait pour ça —
 * il donne un instantané serveur et un instantané client, et re-rend quand le
 * magasin change.
 *
 * Les écritures passent par les modules `offline.ts` / `manifeste.ts` ; elles
 * appellent `notifierChangement()` pour réveiller les abonnés.
 */
const abonnes = new Set<() => void>();
let version = 0;

export function notifierChangement(): void {
  version++;
  for (const abonne of abonnes) abonne();
}

function abonner(rappel: () => void): () => void {
  abonnes.add(rappel);
  // Un autre onglet du même POS qui vend doit rafraîchir celui-ci.
  const surStorage = () => {
    version++;
    rappel();
  };
  window.addEventListener("storage", surStorage);
  return () => {
    abonnes.delete(rappel);
    window.removeEventListener("storage", surStorage);
  };
}

/**
 * Lit une valeur du stockage local. `lecture` doit être stable (useCallback) :
 * son résultat est mis en cache jusqu'au prochain changement, car
 * `useSyncExternalStore` exige un instantané référentiellement stable.
 */
export function useStockageLocal<T>(lecture: () => T, valeurServeur: T): T {
  const cache = useRef<{ version: number; valeur: T } | null>(null);

  const instantane = useCallback(() => {
    if (!cache.current || cache.current.version !== version) {
      cache.current = { version, valeur: lecture() };
    }
    return cache.current.valeur;
  }, [lecture]);

  return useSyncExternalStore(abonner, instantane, () => valeurServeur);
}

function abonnerReseau(rappel: () => void): () => void {
  window.addEventListener("online", rappel);
  window.addEventListener("offline", rappel);
  return () => {
    window.removeEventListener("online", rappel);
    window.removeEventListener("offline", rappel);
  };
}

/**
 * État du réseau. Rendu côté serveur comme « en ligne » : afficher « hors
 * ligne » le temps de l'hydratation ferait clignoter une alerte à chaque
 * chargement de page.
 */
export function useEnLigne(): boolean {
  return useSyncExternalStore(
    abonnerReseau,
    () => navigator.onLine,
    () => true,
  );
}
