"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field, inputClass, buttonClass } from "@/components/ui";
import type { CompanyPolicy } from "@/lib/domain/types";

interface Champ {
  cle: keyof CompanyPolicy;
  label: string;
  unite: string;
  pas?: number;
  /** Valeur exprimée en pourcentage à l'écran, en fraction en base. */
  pourcentage?: boolean;
  /** Valeur exprimée en unités monétaires à l'écran, en centimes en base. */
  montant?: boolean;
}

const CHAMPS: Champ[] = [
  { cle: "transferDeadlineHours", label: "Transfert — délai limite", unite: "h avant le départ" },
  { cle: "resaleDeadlineHours", label: "Revente — délai limite", unite: "h avant le départ" },
  { cle: "resaleFeeRate", label: "Commission de revente", unite: "%", pourcentage: true, pas: 0.5 },
  { cle: "resaleFeeFloorUsd", label: "Plancher de commission", unite: "USD", montant: true, pas: 0.5 },
  { cle: "resaleMaxPerPhonePerMonth", label: "Reventes max par numéro", unite: "par mois" },
  { cle: "postponeDeadlineHours", label: "Report — délai limite", unite: "h avant le départ" },
  { cle: "postponeCreditDays", label: "Validité de l'avoir de report", unite: "jours" },
  { cle: "lateCancelRate", label: "Annulation tardive — récupéré", unite: "%", pourcentage: true, pas: 5 },
  { cle: "lateCancelCreditDays", label: "Validité de l'avoir d'annulation", unite: "jours" },
  { cle: "seatLockMinutes", label: "Durée du verrou de siège", unite: "minutes" },
  { cle: "seatLockPaymentExtensionMinutes", label: "Prolongation pendant le paiement", unite: "minutes" },
  { cle: "maxLocksPerPhone", label: "Sièges maintenus par numéro", unite: "sièges" },
  { cle: "cashVarianceAlertThreshold", label: "Seuil d'alerte d'écart de caisse", unite: "USD", montant: true, pas: 0.5 },
  { cle: "guaranteeHoldRate", label: "Réserve de garantie", unite: "%", pourcentage: true, pas: 0.5 },
];

function versEcran(champ: Champ, valeur: number): number {
  if (champ.pourcentage) return Math.round(valeur * 1000) / 10;
  if (champ.montant) return valeur / 100;
  return valeur;
}

function versBase(champ: Champ, valeur: number): number {
  if (champ.pourcentage) return valeur / 100;
  if (champ.montant) return Math.round(valeur * 100);
  return valeur;
}

export function FormulairePolitique({
  politique,
  parDefaut,
  commission,
  tauxUsdCdf,
}: {
  politique: CompanyPolicy;
  parDefaut: CompanyPolicy;
  commission: number;
  tauxUsdCdf: number;
}) {
  const router = useRouter();
  const [valeurs, setValeurs] = useState<CompanyPolicy>(politique);
  const [tauxCommission, setTauxCommission] = useState(Math.round(commission * 1000) / 10);
  const [taux, setTaux] = useState(tauxUsdCdf);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  return (
    <form
      className="space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setErreur(null);
        setMessage(null);
        setOccupe(true);
        try {
          const response = await fetch("/api/backoffice/parametres", {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              politique: valeurs,
              commission: tauxCommission / 100,
              tauxUsdCdf: taux,
            }),
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.message ?? "Enregistrement impossible.");
          setMessage("Paramètres enregistrés et journalisés.");
          router.refresh();
        } catch (error) {
          setErreur((error as Error).message);
        } finally {
          setOccupe(false);
        }
      }}
    >
      {erreur && (
        <p className="rounded-lg border border-alerte/40 bg-alerte-doux px-3 py-2 text-sm text-alerte">
          {erreur}
        </p>
      )}
      {message && (
        <p className="rounded-lg border border-succes/40 bg-succes-doux px-3 py-2 text-sm text-succes">
          {message}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {CHAMPS.map((champ) => {
          const actuel = versEcran(champ, valeurs[champ.cle]);
          const defaut = versEcran(champ, parDefaut[champ.cle]);
          return (
            <Field
              key={champ.cle}
              label={champ.label}
              hint={actuel !== defaut ? `Valeur de référence : ${defaut} ${champ.unite}` : champ.unite}
            >
              <input
                type="number"
                step={champ.pas ?? 1}
                min={0}
                className={`${inputClass} ${actuel !== defaut ? "border-attention" : ""}`}
                value={actuel}
                onChange={(e) =>
                  setValeurs((current) => ({
                    ...current,
                    [champ.cle]: versBase(champ, Number(e.target.value)),
                  }))
                }
              />
            </Field>
          );
        })}

        <Field label="Commission sur les ventes en ligne" hint="6 à 8 % — prélevée sur la compagnie">
          <input
            type="number"
            step={0.1}
            min={0}
            max={20}
            className={inputClass}
            value={tauxCommission}
            onChange={(e) => setTauxCommission(Number(e.target.value))}
          />
        </Field>
        <Field label="Taux de change USD → CDF" hint="Daté à l'enregistrement">
          <input
            type="number"
            step={1}
            min={1}
            className={inputClass}
            value={taux}
            onChange={(e) => setTaux(Number(e.target.value))}
          />
        </Field>
      </div>

      <button type="submit" className={buttonClass} disabled={occupe}>
        {occupe ? "Enregistrement…" : "Enregistrer"}
      </button>
    </form>
  );
}
