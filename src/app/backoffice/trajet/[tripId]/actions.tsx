"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  Field,
  Why,
  inputClass,
  buttonClass,
  buttonSecondaryClass,
  buttonDangerClass,
} from "@/components/ui";
import { CHANNEL_LABELS, type Channel } from "@/lib/domain/types";
import type { SeatAvailability } from "@/lib/domain/seats";

/** §2.3 : « Le gérant rééquilibre l'allocation à tout moment. » */
export function Allocation({
  tripId,
  disponibilite,
}: {
  tripId: string;
  disponibilite: SeatAvailability[];
}) {
  const router = useRouter();
  const [de, setDe] = useState<Channel>("EN_LIGNE");
  const [vers, setVers] = useState<Channel>("GUICHET");
  const [nombre, setNombre] = useState(5);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const source = disponibilite.find((a) => a.channel === de);

  return (
    <form
      className="grid gap-3 sm:grid-cols-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setErreur(null);
        setMessage(null);
        setOccupe(true);
        try {
          const response = await fetch(`/api/trajets/${tripId}/allocation`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ from: de, to: vers, count: nombre }),
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.message ?? "Rééquilibrage impossible.");
          setMessage(`${data.deplaces.length} siège(s) déplacé(s) : ${data.deplaces.join(", ")}.`);
          router.refresh();
        } catch (error) {
          setErreur((error as Error).message);
        } finally {
          setOccupe(false);
        }
      }}
    >
      {erreur && (
        <p className="rounded-lg border border-alerte/40 bg-alerte-doux px-3 py-2 text-sm text-alerte sm:col-span-4">
          {erreur}
        </p>
      )}
      {message && (
        <p className="rounded-lg border border-succes/40 bg-succes-doux px-3 py-2 text-sm text-succes sm:col-span-4">
          {message}
        </p>
      )}

      <Field label="Depuis le quota" hint={source ? `${source.disponibles} libres` : undefined}>
        <select className={inputClass} value={de} onChange={(e) => setDe(e.target.value as Channel)}>
          {disponibilite.map((allocation) => (
            <option key={allocation.channel} value={allocation.channel}>
              {CHANNEL_LABELS[allocation.channel]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Vers le quota">
        <select
          className={inputClass}
          value={vers}
          onChange={(e) => setVers(e.target.value as Channel)}
        >
          {disponibilite
            .filter((a) => a.channel !== de)
            .map((allocation) => (
              <option key={allocation.channel} value={allocation.channel}>
                {CHANNEL_LABELS[allocation.channel]}
              </option>
            ))}
        </select>
      </Field>
      <Field label="Nombre de sièges">
        <input
          type="number"
          min={1}
          max={source?.disponibles ?? 1}
          className={inputClass}
          value={nombre}
          onChange={(e) => setNombre(Number(e.target.value))}
        />
      </Field>
      <div className="flex items-end">
        <button
          type="submit"
          className={`${buttonSecondaryClass} w-full`}
          disabled={occupe || de === vers || (source?.disponibles ?? 0) < nombre}
        >
          Rééquilibrer
        </button>
      </div>
    </form>
  );
}

/** Départ effectif, clôture, annulation du trajet. */
export function ActionsTrajet({
  tripId,
  statut,
  departEffectif,
  manifesteClos,
}: {
  tripId: string;
  statut: string;
  departEffectif: string | null;
  manifesteClos: string | null;
}) {
  const router = useRouter();
  const [motif, setMotif] = useState("");
  const [ouvert, setOuvert] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const appeler = async (url: string, init: RequestInit) => {
    setErreur(null);
    setMessage(null);
    setOccupe(true);
    try {
      const response = await fetch(url, {
        ...init,
        headers: { "content-type": "application/json", ...(init.headers ?? {}) },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Action impossible.");
      router.refresh();
      return data;
    } catch (error) {
      setErreur((error as Error).message);
      return null;
    } finally {
      setOccupe(false);
    }
  };

  return (
    <Card title="Exploitation du départ">
      {erreur && (
        <p className="mb-3 rounded-lg border border-alerte/40 bg-alerte-doux px-3 py-2 text-sm text-alerte">
          {erreur}
        </p>
      )}
      {message && (
        <p className="mb-3 rounded-lg border border-succes/40 bg-succes-doux px-3 py-2 text-sm text-succes">
          {message}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <a href={`/controle/${tripId}`} className={buttonSecondaryClass}>
          Ouvrir le manifeste
        </a>
        <button
          type="button"
          className={buttonClass}
          disabled={Boolean(departEffectif) || statut === "ANNULE" || occupe}
          onClick={async () => {
            const data = await appeler(`/api/trajets/${tripId}/depart`, { method: "POST" });
            if (data) setMessage("Départ effectif enregistré.");
          }}
        >
          {departEffectif ? "Départ enregistré" : "Enregistrer le départ effectif"}
        </button>
        <button
          type="button"
          className={buttonSecondaryClass}
          disabled={!departEffectif || Boolean(manifesteClos) || occupe}
          onClick={async () => {
            const data = await appeler(`/api/trajets/${tripId}/cloture`, { method: "POST" });
            if (data) {
              setMessage(
                `Manifeste clôturé : ${data.embarques} embarqué(s), ${data.noShows} no-show(s).`,
              );
            }
          }}
        >
          {manifesteClos ? "Manifeste clôturé" : "Clôturer le manifeste"}
        </button>
        <button
          type="button"
          className={buttonDangerClass}
          disabled={statut === "ANNULE" || occupe}
          onClick={() => setOuvert(!ouvert)}
        >
          Annuler le départ
        </button>
      </div>

      {ouvert && (
        <div className="mt-3 rounded-lg border border-alerte/40 bg-alerte-doux p-3">
          <Field label="Motif d'annulation (obligatoire)">
            <input
              className={inputClass}
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              placeholder="Bus en panne, route coupée…"
            />
          </Field>
          <button
            type="button"
            className={`${buttonDangerClass} mt-3`}
            disabled={!motif.trim() || occupe}
            onClick={async () => {
              const data = await appeler("/api/backoffice/trajets", {
                method: "DELETE",
                body: JSON.stringify({ trajetId: tripId, motif }),
              });
              if (data) {
                setOuvert(false);
                setMessage(
                  `Départ annulé. ${data.billetsImpactes} billet(s) à traiter : appliquez la ` +
                    "grille de responsabilité (100 % remboursés + avoir 25 %, imputés à la compagnie).",
                );
              }
            }}
          >
            Confirmer l&apos;annulation
          </button>
        </div>
      )}

      <div className="mt-3">
        <Why>
          Le départ effectif fait foi, jamais l&apos;horaire théorique. Tant qu&apos;il n&apos;est
          pas enregistré, aucun billet ne peut passer en no-show : un passager en retard sur un bus
          lui-même en retard embarque normalement.
        </Why>
      </div>
    </Card>
  );
}
