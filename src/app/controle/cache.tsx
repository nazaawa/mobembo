"use client";

import Link from "next/link";
import { useCallback } from "react";
import { manifestesLocaux, scansLocaux, type ManifesteLocal } from "@/lib/client/manifeste";
import { useStockageLocal } from "@/lib/client/store";
import { Card, Badge } from "@/components/ui";

const AUCUN: ManifesteLocal[] = [];

/** Manifestes déjà en cache : ce que le terminal peut contrôler sans réseau. */
export function ManifestesEnCache() {
  const lireManifestes = useCallback(() => manifestesLocaux(), []);
  const lireEnAttente = useCallback(
    () => scansLocaux().filter((scan) => !scan.synchronise).length,
    [],
  );

  const manifestes = useStockageLocal(lireManifestes, AUCUN);
  const enAttente = useStockageLocal(lireEnAttente, 0);

  if (manifestes.length === 0) return null;

  return (
    <Card
      title="Disponibles hors connexion"
      actions={
        enAttente > 0 ? (
          <Badge tone="attention">{enAttente} scan(s) à synchroniser</Badge>
        ) : (
          <Badge tone="succes">Tout est synchronisé</Badge>
        )
      }
    >
      <ul className="space-y-2 text-sm">
        {manifestes.map((manifeste) => (
          <li key={manifeste.tripId}>
            <Link
              href={`/controle/${manifeste.tripId}`}
              className="flex items-center justify-between rounded-lg bg-surface-alt px-3 py-2 hover:brightness-95"
            >
              <span>
                {manifeste.ligne}
                <span className="ml-2 text-xs text-texte-doux">bus {manifeste.plaque}</span>
              </span>
              <span className="text-xs text-texte-doux">
                {manifeste.totalValides} billet(s) valides
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
