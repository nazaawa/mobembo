"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatMoney, type Currency } from "@/lib/core/money";
import { deviceId } from "@/lib/client/offline";
import { Field, inputClass, buttonClass, buttonDangerClass, Money } from "@/components/ui";

/** §2.4.1 Ouverture — fond de caisse initial, horodatage, identification. */
export function OuvertureCaisse() {
  const router = useRouter();
  const [fond, setFond] = useState("0");
  const [devise, setDevise] = useState<Currency>("USD");
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  return (
    <form
      className="grid gap-3 sm:grid-cols-3"
      onSubmit={async (event) => {
        event.preventDefault();
        setErreur(null);
        setOccupe(true);
        try {
          const response = await fetch("/api/guichet/caisse", {
            method: "POST",
            headers: { "content-type": "application/json", "x-mobembo-device": deviceId() },
            body: JSON.stringify({
              fondInitial: Math.round(Number(fond) * 100),
              devise,
            }),
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.message ?? "Ouverture impossible.");
          router.refresh();
        } catch (error) {
          setErreur((error as Error).message);
        } finally {
          setOccupe(false);
        }
      }}
    >
      {erreur && (
        <p className="rounded-lg border border-alerte/40 bg-alerte-doux px-3 py-2 text-sm text-alerte sm:col-span-3">
          {erreur}
        </p>
      )}
      <Field label="Fond de caisse initial">
        <input
          className={inputClass}
          inputMode="decimal"
          value={fond}
          onChange={(e) => setFond(e.target.value.replace(/[^\d.,]/g, "").replace(",", "."))}
        />
      </Field>
      <Field label="Devise de la caisse">
        <select
          className={inputClass}
          value={devise}
          onChange={(e) => setDevise(e.target.value as Currency)}
        >
          <option value="USD">USD</option>
          <option value="CDF">CDF</option>
        </select>
      </Field>
      <div className="flex items-end">
        <button type="submit" className={`${buttonClass} w-full`} disabled={occupe}>
          {occupe ? "…" : "Ouvrir la caisse"}
        </button>
      </div>
    </form>
  );
}

/**
 * §2.4.3 Fermeture — « l'agent saisit le montant physiquement compté, le
 * système calcule l'écart. » L'écart s'affiche immédiatement, sans possibilité
 * de rouvrir la session.
 */
export function FermetureCaisse({
  sessionId,
  attendu,
  devise,
}: {
  sessionId: string;
  attendu: number;
  devise: string;
}) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [compte, setCompte] = useState("");
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [resultat, setResultat] = useState<{ ecart: number; nbBillets: number } | null>(null);

  if (resultat) {
    const excedent = resultat.ecart > 0;
    const juste = resultat.ecart === 0;
    return (
      <div
        className={`rounded-lg border px-4 py-3 ${
          juste
            ? "border-succes/40 bg-succes-doux"
            : "border-alerte/40 bg-alerte-doux"
        }`}
      >
        <p className="text-sm font-semibold">
          Caisse fermée — {resultat.nbBillets} billet(s) vendu(s).
        </p>
        <p className={`mt-1 text-lg font-semibold ${juste ? "text-succes" : "text-alerte"}`}>
          {juste
            ? "Aucun écart."
            : `Écart de ${formatMoney(resultat.ecart, devise as Currency)} ${
                excedent ? "(excédent)" : "(manquant)"
              }`}
        </p>
        <p className="mt-1 text-xs text-texte-doux">
          Cette session ne peut plus être ni rouverte ni modifiée. Le gérant en est informé.
        </p>
        <button
          type="button"
          className={`${buttonClass} mt-3`}
          onClick={() => router.refresh()}
        >
          Continuer
        </button>
      </div>
    );
  }

  if (!ouvert) {
    return (
      <button type="button" className={buttonDangerClass} onClick={() => setOuvert(true)}>
        Fermer la caisse
      </button>
    );
  }

  return (
    <form
      className="rounded-lg border border-bordure bg-surface-alt p-3"
      onSubmit={async (event) => {
        event.preventDefault();
        setErreur(null);
        setOccupe(true);
        try {
          const response = await fetch(`/api/guichet/caisse/${sessionId}/fermeture`, {
            method: "POST",
            headers: { "content-type": "application/json", "x-mobembo-device": deviceId() },
            body: JSON.stringify({ montantCompte: Math.round(Number(compte) * 100) }),
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.message ?? "Fermeture impossible.");
          setResultat({ ecart: data.ecart, nbBillets: data.nbBillets });
        } catch (error) {
          setErreur((error as Error).message);
        } finally {
          setOccupe(false);
        }
      }}
    >
      {erreur && (
        <p className="mb-3 rounded-lg border border-alerte/40 bg-alerte-doux px-3 py-2 text-sm text-alerte">
          {erreur}
        </p>
      )}
      <p className="mb-3 text-sm">
        Comptez physiquement votre caisse, puis saisissez le montant. Le système attend{" "}
        <strong>
          <Money amount={attendu} currency={devise} />
        </strong>{" "}
        — ne recopiez pas ce chiffre, comptez.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Montant physiquement compté">
          <input
            className={inputClass}
            inputMode="decimal"
            autoFocus
            value={compte}
            onChange={(e) => setCompte(e.target.value.replace(/[^\d.,]/g, "").replace(",", "."))}
          />
        </Field>
        <div className="flex items-end gap-2 sm:col-span-2">
          <button type="submit" className={buttonDangerClass} disabled={!compte || occupe}>
            {occupe ? "…" : "Fermer définitivement"}
          </button>
          <button
            type="button"
            className="rounded-lg px-3 py-2 text-sm text-texte-doux hover:text-texte"
            onClick={() => setOuvert(false)}
          >
            Annuler
          </button>
        </div>
      </div>
    </form>
  );
}
