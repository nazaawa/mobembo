"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field, inputClass, buttonClass, buttonSecondaryClass } from "@/components/ui";
import { seatGrid, AISLE } from "@/lib/domain/seat-map";
import type { SeatMapLayout, BusCategory, VehicleType } from "@/lib/domain/types";
import { VEHICLE_TYPE_LABELS } from "@/lib/domain/types";

function useEnvoi() {
  const router = useRouter();
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const envoyer = async (url: string, payload: unknown, methode = "POST") => {
    setErreur(null);
    setOccupe(true);
    try {
      const response = await fetch(url, {
        method: methode,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Enregistrement impossible.");
      router.refresh();
      return data;
    } catch (error) {
      setErreur((error as Error).message);
      return null;
    } finally {
      setOccupe(false);
    }
  };

  return { envoyer, occupe, erreur };
}

function Erreur({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="mb-3 rounded-lg border border-alerte/40 bg-alerte-doux px-3 py-2 text-sm text-alerte">
      {message}
    </p>
  );
}

export function FormulaireAgence() {
  const { envoyer, occupe, erreur } = useEnvoi();
  const [nom, setNom] = useState("");
  const [ville, setVille] = useState("");
  const [adresse, setAdresse] = useState("");
  const [horaires, setHoraires] = useState("05:00-19:00");

  return (
    <form
      className="grid gap-3 sm:grid-cols-5"
      onSubmit={async (event) => {
        event.preventDefault();
        const data = await envoyer("/api/backoffice/agences", { nom, ville, adresse, horaires });
        if (data) {
          setNom("");
          setVille("");
          setAdresse("");
        }
      }}
    >
      <div className="sm:col-span-5">
        <Erreur message={erreur} />
      </div>
      <Field label="Nom de l'agence">
        <input className={inputClass} value={nom} onChange={(e) => setNom(e.target.value)} required />
      </Field>
      <Field label="Ville">
        <input className={inputClass} value={ville} onChange={(e) => setVille(e.target.value)} required />
      </Field>
      <Field label="Adresse">
        <input className={inputClass} value={adresse} onChange={(e) => setAdresse(e.target.value)} />
      </Field>
      <Field label="Horaires">
        <input className={inputClass} value={horaires} onChange={(e) => setHoraires(e.target.value)} />
      </Field>
      <div className="flex items-end">
        <button type="submit" className={`${buttonClass} w-full`} disabled={occupe}>
          Ajouter
        </button>
      </div>
    </form>
  );
}

export function FormulaireBus({ plans }: { plans: Array<{ id: string; name: string }> }) {
  const { envoyer, occupe, erreur } = useEnvoi();
  const [plaque, setPlaque] = useState("");
  const [planId, setPlanId] = useState(plans[0]?.id ?? "");
  const [categorie, setCategorie] = useState<BusCategory>("STANDARD");
  const [vehiculeType, setVehiculeType] = useState<VehicleType>("BUS");

  if (plans.length === 0) {
    return <p className="text-xs text-texte-doux">Créez d&apos;abord un plan de sièges.</p>;
  }

  return (
    <form
      className="grid gap-3 sm:grid-cols-5"
      onSubmit={async (event) => {
        event.preventDefault();
        const data = await envoyer("/api/backoffice/bus", { plaque, planId, categorie, vehiculeType });
        if (data) setPlaque("");
      }}
    >
      <div className="sm:col-span-5">
        <Erreur message={erreur} />
      </div>
      <Field label="Plaque">
        <input
          className={`${inputClass} font-mono uppercase`}
          value={plaque}
          onChange={(e) => setPlaque(e.target.value)}
          placeholder="KN 0000 AA"
          required
        />
      </Field>
      <Field label="Plan de sièges">
        <select className={inputClass} value={planId} onChange={(e) => setPlanId(e.target.value)}>
          {plans.map((plan) => (
            <option key={plan.id} value={plan.id}>
              {plan.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Catégorie">
        <select
          className={inputClass}
          value={categorie}
          onChange={(e) => setCategorie(e.target.value as BusCategory)}
        >
          <option value="STANDARD">Standard</option>
          <option value="VIP">VIP</option>
        </select>
      </Field>
      <Field label="Type de véhicule">
        <select
          className={inputClass}
          value={vehiculeType}
          onChange={(e) => setVehiculeType(e.target.value as VehicleType)}
        >
          <option value="BUS">{VEHICLE_TYPE_LABELS.BUS}</option>
          <option value="VOITURE">{VEHICLE_TYPE_LABELS.VOITURE}</option>
        </select>
      </Field>
      <div className="flex items-end">
        <button type="submit" className={`${buttonClass} w-full`} disabled={occupe}>
          Ajouter
        </button>
      </div>
    </form>
  );
}

export function FormulaireLigne() {
  const { envoyer, occupe, erreur } = useEnvoi();
  const [origine, setOrigine] = useState("");
  const [destination, setDestination] = useState("");
  const [distance, setDistance] = useState("");
  const [duree, setDuree] = useState("");

  return (
    <form
      className="grid gap-3 sm:grid-cols-5"
      onSubmit={async (event) => {
        event.preventDefault();
        const data = await envoyer("/api/backoffice/lignes", {
          origine,
          destination,
          distanceKm: distance ? Number(distance) : undefined,
          dureeMin: duree ? Number(duree) : undefined,
        });
        if (data) {
          setOrigine("");
          setDestination("");
          setDistance("");
          setDuree("");
        }
      }}
    >
      <div className="sm:col-span-5">
        <Erreur message={erreur} />
      </div>
      <Field label="Origine">
        <input className={inputClass} value={origine} onChange={(e) => setOrigine(e.target.value)} required />
      </Field>
      <Field label="Destination">
        <input
          className={inputClass}
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
          required
        />
      </Field>
      <Field label="Distance (km)">
        <input
          className={inputClass}
          inputMode="numeric"
          value={distance}
          onChange={(e) => setDistance(e.target.value.replace(/\D/g, ""))}
        />
      </Field>
      <Field label="Durée (minutes)">
        <input
          className={inputClass}
          inputMode="numeric"
          value={duree}
          onChange={(e) => setDuree(e.target.value.replace(/\D/g, ""))}
        />
      </Field>
      <div className="flex items-end">
        <button type="submit" className={`${buttonClass} w-full`} disabled={occupe}>
          Ajouter
        </button>
      </div>
    </form>
  );
}

/**
 * §2.1 : « Il est éditable graphiquement dans le back-office. »
 *
 * L'éditeur montre le plan en train de se construire et permet de désactiver
 * un siège d'un clic — porte, moteur, roue. Saisir « 8C, 8D » dans un champ
 * texte serait plus rapide à coder et impossible à vérifier d'un coup d'œil.
 */
export function EditeurPlan({ dispositions }: { dispositions: Record<string, SeatMapLayout> }) {
  const { envoyer, occupe, erreur } = useEnvoi();
  const [ouvert, setOuvert] = useState(false);
  const [nom, setNom] = useState("");
  const [rangees, setRangees] = useState(15);
  const [preset, setPreset] = useState(Object.keys(dispositions)[0]);
  const [desactives, setDesactives] = useState<string[]>([]);

  const disposition = dispositions[preset];
  const grille = seatGrid(rangees, disposition, []);
  const total = grille.flat().filter(Boolean).length - desactives.length;

  if (!ouvert) {
    return (
      <button type="button" className={buttonSecondaryClass} onClick={() => setOuvert(true)}>
        Nouveau plan de sièges
      </button>
    );
  }

  return (
    <form
      className="space-y-3"
      onSubmit={async (event) => {
        event.preventDefault();
        const data = await envoyer("/api/backoffice/plans", {
          nom,
          rangees,
          disposition,
          siegesDesactives: desactives,
        });
        if (data) {
          setOuvert(false);
          setNom("");
          setDesactives([]);
        }
      }}
    >
      <Erreur message={erreur} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Nom du plan">
          <input
            className={inputClass}
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            placeholder="Autocar 2+2 — 60 places"
            required
          />
        </Field>
        <Field label="Rangées">
          <input
            type="number"
            min={1}
            max={30}
            className={inputClass}
            value={rangees}
            onChange={(e) => setRangees(Math.max(1, Math.min(30, Number(e.target.value))))}
          />
        </Field>
        <Field label="Disposition">
          <select
            className={inputClass}
            value={preset}
            onChange={(e) => {
              setPreset(e.target.value);
              setDesactives([]);
            }}
          >
            {Object.keys(dispositions).map((cle) => (
              <option key={cle} value={cle}>
                {cle}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div>
        <p className="mb-2 text-xs text-texte-doux">
          Cliquez un siège pour le désactiver (porte, moteur, roue). {total} places au total.
        </p>
        <div className="inline-block rounded-lg border border-bordure bg-surface-alt p-2">
          {grille.map((rangee, index) => (
            <div key={index} className="flex items-center gap-1">
              <span className="w-4 text-right text-[9px] tabular-nums text-texte-doux">
                {index + 1}
              </span>
              {rangee.map((siege, colonne) =>
                siege === null && disposition.columns[colonne] === AISLE ? (
                  <span key={colonne} className="w-3" aria-hidden />
                ) : (
                  <button
                    key={colonne}
                    type="button"
                    className={`h-6 w-6 rounded border text-[9px] tabular-nums ${
                      siege && desactives.includes(siege)
                        ? "border-dashed border-bordure bg-transparent text-texte-doux/40"
                        : "border-accent/40 bg-accent-doux text-accent"
                    }`}
                    style={{ minHeight: "1.5rem" }}
                    onClick={() =>
                      siege &&
                      setDesactives((current) =>
                        current.includes(siege)
                          ? current.filter((s) => s !== siege)
                          : [...current, siege],
                      )
                    }
                  >
                    {siege}
                  </button>
                ),
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <button type="submit" className={buttonClass} disabled={occupe || !nom}>
          Enregistrer le plan
        </button>
        <button type="button" className={buttonSecondaryClass} onClick={() => setOuvert(false)}>
          Annuler
        </button>
      </div>
    </form>
  );
}
