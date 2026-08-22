"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  file,
  retirer,
  marquerRefus,
  marquerSynchronise,
  quotasTelecharges,
  derniereSynchro,
  marquerSynchro,
  type VenteEnFile,
  type QuotaLocal,
} from "@/lib/client/offline";
import { useEnLigne, useStockageLocal } from "@/lib/client/store";
import { buttonSecondaryClass } from "@/components/ui";

interface ResultatSync {
  clientOpId: string;
  statut: "APPLIQUE" | "REFUSE";
  billets?: Array<{ code: string; sequence: number | null; qr: string }>;
  erreur?: string;
  message?: string;
}

const AUCUNE_VENTE: VenteEnFile[] = [];
const AUCUN_QUOTA: QuotaLocal[] = [];

/**
 * §2.4 : « Synchronisation automatique au retour du réseau. »
 *
 * Le déclenchement est automatique — l'agent n'a rien à penser — mais le bouton
 * reste offert : au retour du réseau après plusieurs heures, il veut voir la
 * file se vider sous ses yeux plutôt que d'espérer.
 */
export function Synchronisation() {
  const router = useRouter();
  const enLigne = useEnLigne();
  const [occupe, setOccupe] = useState(false);

  const lireFile = useCallback(() => file(), []);
  const lireQuotas = useCallback(() => quotasTelecharges(), []);
  const lireDerniere = useCallback(() => derniereSynchro(), []);
  const ventes = useStockageLocal(lireFile, AUCUNE_VENTE);
  const quotas = useStockageLocal(lireQuotas, AUCUN_QUOTA);
  const dernier = useStockageLocal(lireDerniere, null);

  const enAttente = ventes.filter((vente) => !vente.refus);
  const refuses = ventes.filter((vente) => Boolean(vente.refus));

  /**
   * Vide la file. Ne touche à aucun état React avant son premier `await` : le
   * déclenchement automatique ne doit pas provoquer de rendu en cascade.
   */
  const synchroniser = useCallback(async () => {
    const aEnvoyer = file().filter((vente) => !vente.refus);
    if (aEnvoyer.length === 0 || !navigator.onLine) return;
    try {
      const response = await fetch("/api/guichet/synchronisation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ventes: aEnvoyer }),
      });
      if (!response.ok) return;
      const data = (await response.json()) as { resultats: ResultatSync[] };

      const appliques: string[] = [];
      for (const resultat of data.resultats) {
        if (resultat.statut === "APPLIQUE") {
          appliques.push(resultat.clientOpId);
          marquerSynchronise(resultat.clientOpId, resultat.billets?.[0]?.code);
        } else {
          // Une vente refusée ne disparaît pas : le gérant doit pouvoir la voir
          // et rembourser le passager encaissé hors-ligne.
          marquerRefus(resultat.clientOpId, {
            code: resultat.erreur ?? "ERREUR",
            message: resultat.message ?? "Refusée par le serveur.",
          });
        }
      }
      retirer(appliques);
      marquerSynchro(new Date().toISOString());
      router.refresh();
    } catch {
      /* toujours hors-ligne : la file reste intacte */
    }
  }, [router]);

  /** Déclenchement manuel : lui seul affiche un indicateur d'activité. */
  const synchroniserManuellement = useCallback(async () => {
    setOccupe(true);
    try {
      await synchroniser();
    } finally {
      setOccupe(false);
    }
  }, [synchroniser]);

  // Un effet est ici légitime : il pousse l'état local vers un système
  // extérieur — le serveur — plutôt que de recopier un état React dans un autre.
  useEffect(() => {
    void synchroniser();
    const interval = setInterval(() => void synchroniser(), 20_000);
    return () => clearInterval(interval);
  }, [synchroniser, enLigne]);

  return (
    <div className="text-right text-xs">
      <button
        type="button"
        className={buttonSecondaryClass}
        disabled={occupe || enAttente.length === 0}
        onClick={() => void synchroniserManuellement()}
      >
        {occupe
          ? "Synchronisation…"
          : enAttente.length > 0
            ? `Synchroniser ${enAttente.length} vente(s)`
            : "File vide"}
      </button>
      <div className="mt-1 space-y-0.5 text-texte-doux">
        {dernier && (
          <div>Dernière synchro : {new Date(dernier).toLocaleTimeString("fr-CD")}</div>
        )}
        {quotas.length > 0 && <div>{quotas.length} quota(s) hors-ligne en cache</div>}
      </div>
      {refuses.length > 0 && (
        <div className="mt-2 max-w-sm rounded-lg border border-alerte/40 bg-alerte-doux px-3 py-2 text-left text-alerte">
          <p className="font-semibold">
            {refuses.length} vente(s) refusée(s) à la synchronisation
          </p>
          <ul className="mt-1 space-y-1">
            {refuses.map((vente) => (
              <li key={vente.clientOpId}>
                Sièges {vente.sieges.join(", ")} — {vente.refus?.message}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-[11px]">
            Prévenez le gérant : le passager a payé, il faut le rembourser ou lui attribuer un
            autre siège.
          </p>
          <button
            type="button"
            className="mt-2 text-[11px] underline"
            onClick={() => retirer(refuses.map((v) => v.clientOpId))}
          >
            Marquer comme traitées
          </button>
        </div>
      )}
    </div>
  );
}
