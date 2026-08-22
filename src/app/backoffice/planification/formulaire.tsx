"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field, inputClass, buttonClass, Why } from "@/components/ui";
import type { BusCategory, Channel, DepartureMode } from "@/lib/domain/types";

export function FormulaireTrajet({
  lignes,
  bus,
  agences,
}: {
  lignes: Array<{ id: string; origin_city: string; destination_city: string }>;
  bus: Array<{ id: string; plate_number: string; category: string; seat_count: number }>;
  agences: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [ligneId, setLigneId] = useState(lignes[0]?.id ?? "");
  const [busId, setBusId] = useState(bus[0]?.id ?? "");
  const [agenceId, setAgenceId] = useState(agences[0]?.id ?? "");
  const [depart, setDepart] = useState("");
  const [mode, setMode] = useState<DepartureMode>("HORAIRE_FIXE");
  const [prixUsd, setPrixUsd] = useState("15");
  const [prixCdf, setPrixCdf] = useState("42750");
  const [quotaGuichet, setQuotaGuichet] = useState(35);
  const [quotaEnLigne, setQuotaEnLigne] = useState(20);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const busChoisi = bus.find((b) => b.id === busId);
  const places = busChoisi?.seat_count ?? 0;
  // Le reste va à la réserve compagnie : l'allocation couvre toujours le bus,
  // sinon des sièges existeraient sans canal propriétaire.
  const reserve = places - quotaGuichet - quotaEnLigne;

  if (lignes.length === 0 || bus.length === 0) {
    return (
      <p className="text-sm text-texte-doux">
        Créez d&apos;abord au moins une ligne et un bus dans le référentiel.
      </p>
    );
  }

  return (
    <form
      className="space-y-3"
      onSubmit={async (event) => {
        event.preventDefault();
        setErreur(null);
        setMessage(null);
        if (reserve < 0) {
          setErreur(`L'allocation dépasse la capacité du bus de ${-reserve} siège(s).`);
          return;
        }
        setOccupe(true);
        try {
          const response = await fetch("/api/backoffice/trajets", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              ligneId,
              busId,
              agenceId,
              depart: new Date(depart).toISOString(),
              mode,
              tarifs: [
                {
                  categorie: (busChoisi?.category ?? "STANDARD") as BusCategory,
                  prixUsd: Math.round(Number(prixUsd) * 100),
                  prixCdf: Math.round(Number(prixCdf) * 100),
                },
              ],
              quotas: {
                GUICHET: quotaGuichet,
                EN_LIGNE: mode === "HORAIRE_FIXE" ? quotaEnLigne : 0,
                RESERVE_COMPAGNIE: mode === "HORAIRE_FIXE" ? reserve : places - quotaGuichet,
              } satisfies Record<Channel, number>,
            }),
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.message ?? "Création impossible.");
          setMessage("Départ programmé, sièges et quotas créés.");
          setDepart("");
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

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Field label="Ligne">
          <select className={inputClass} value={ligneId} onChange={(e) => setLigneId(e.target.value)}>
            {lignes.map((ligne) => (
              <option key={ligne.id} value={ligne.id}>
                {ligne.origin_city} → {ligne.destination_city}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Bus">
          <select className={inputClass} value={busId} onChange={(e) => setBusId(e.target.value)}>
            {bus.map((vehicule) => (
              <option key={vehicule.id} value={vehicule.id}>
                {vehicule.plate_number} — {vehicule.category} ({vehicule.seat_count} pl.)
              </option>
            ))}
          </select>
        </Field>
        <Field label="Agence de départ">
          <select className={inputClass} value={agenceId} onChange={(e) => setAgenceId(e.target.value)}>
            {agences.map((agence) => (
              <option key={agence.id} value={agence.id}>
                {agence.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Date et heure de départ">
          <input
            type="datetime-local"
            className={inputClass}
            value={depart}
            onChange={(e) => setDepart(e.target.value)}
            required
          />
        </Field>
        <Field label="Mode de départ">
          <select
            className={inputClass}
            value={mode}
            onChange={(e) => setMode(e.target.value as DepartureMode)}
          >
            <option value="HORAIRE_FIXE">Horaire fixe (vendable en ligne)</option>
            <option value="DEPART_A_REMPLISSAGE">Au remplissage (guichet seul)</option>
          </select>
        </Field>
        <Field label="Prix USD">
          <input
            className={inputClass}
            inputMode="decimal"
            value={prixUsd}
            onChange={(e) => setPrixUsd(e.target.value.replace(/[^\d.]/g, ""))}
          />
        </Field>
        <Field label="Prix CDF">
          <input
            className={inputClass}
            inputMode="decimal"
            value={prixCdf}
            onChange={(e) => setPrixCdf(e.target.value.replace(/[^\d.]/g, ""))}
          />
        </Field>
      </div>

      <fieldset className="rounded-lg border border-bordure p-3">
        <legend className="px-1 text-xs font-medium text-texte-doux">
          Allocation par canal — {places} places au total
        </legend>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Quota guichet">
            <input
              type="number"
              min={0}
              max={places}
              className={inputClass}
              value={quotaGuichet}
              onChange={(e) => setQuotaGuichet(Number(e.target.value))}
            />
          </Field>
          <Field label="Quota en ligne" hint={mode === "HORAIRE_FIXE" ? undefined : "forcé à 0"}>
            <input
              type="number"
              min={0}
              max={places}
              className={inputClass}
              value={mode === "HORAIRE_FIXE" ? quotaEnLigne : 0}
              disabled={mode !== "HORAIRE_FIXE"}
              onChange={(e) => setQuotaEnLigne(Number(e.target.value))}
            />
          </Field>
          <Field label="Réserve compagnie">
            <input
              className={`${inputClass} ${reserve < 0 ? "border-alerte text-alerte" : ""}`}
              value={mode === "HORAIRE_FIXE" ? reserve : places - quotaGuichet}
              readOnly
            />
          </Field>
        </div>
        <div className="mt-3">
          <Why>
            Si le guichet perd internet, il continue de vendre son quota local sans risque de
            doublon avec les ventes en ligne. Sans allocation, une coupure réseau au guichet égale
            un surbooking garanti.
          </Why>
        </div>
      </fieldset>

      <button type="submit" className={buttonClass} disabled={occupe || !depart}>
        {occupe ? "Création…" : "Programmer le départ"}
      </button>
    </form>
  );
}
