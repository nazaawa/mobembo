"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { JOURS, formatDays, parseDays } from "@/lib/domain/schedule-format";
import type { CompanyScheduleRow, ScheduleStatus } from "@/lib/domain/schedules";
import { formatMoney, fromMinor, toMinor } from "@/lib/core/money";
import {
  Badge,
  Field,
  Table,
  buttonClass,
  buttonSecondaryClass,
  inputClass,
} from "@/components/ui";
import type { VehicleType } from "@/lib/domain/types";

interface Agence {
  id: string;
  name: string;
  city: string;
}

type Brouillon = {
  villeDepart: string;
  villeArrivee: string;
  heure: string;
  jours: number[];
  prixUsd: string;
  prixCdf: string;
  pointEmbarquement: string;
  gps: string;
  typeVehicule: VehicleType;
  libelleVehicule: string;
  dureeMin: string;
  informations: string;
  reservationOuverte: boolean;
  placesEnLigne: string;
  agenceId: string;
};

const VIDE: Brouillon = {
  villeDepart: "",
  villeArrivee: "",
  heure: "08:00",
  jours: [1, 2, 3, 4, 5, 6, 7],
  prixUsd: "",
  prixCdf: "",
  pointEmbarquement: "",
  gps: "",
  typeVehicule: "BUS",
  libelleVehicule: "",
  dureeMin: "",
  informations: "",
  reservationOuverte: false,
  placesEnLigne: "0",
  agenceId: "",
};

function depuis(horaire: CompanyScheduleRow): Brouillon {
  return {
    villeDepart: horaire.origin_city,
    villeArrivee: horaire.destination_city,
    heure: horaire.departure_time,
    jours: parseDays(horaire.days_of_week),
    prixUsd: horaire.price_usd === null ? "" : String(fromMinor(horaire.price_usd)),
    prixCdf: horaire.price_cdf === null ? "" : String(fromMinor(horaire.price_cdf)),
    pointEmbarquement: horaire.boarding_point ?? "",
    gps: horaire.boarding_gps ?? "",
    typeVehicule: horaire.vehicle_type,
    libelleVehicule: horaire.vehicle_label ?? "",
    dureeMin: horaire.duration_est_min === null ? "" : String(horaire.duration_est_min),
    informations: horaire.notes ?? "",
    reservationOuverte: horaire.booking_enabled === 1,
    placesEnLigne: String(horaire.online_quota),
    agenceId: horaire.agency_id ?? "",
  };
}

/**
 * Un seul écran pour publier, corriger et ouvrir des places.
 *
 * §5.5 exige qu'un changement de prix ou d'heure tienne en quelques actions :
 * ces deux champs sont donc éditables directement dans la ligne du tableau,
 * sans ouvrir le formulaire complet.
 */
export function GestionHoraires({
  horaires,
  agences,
  reservationOuverte,
}: {
  horaires: CompanyScheduleRow[];
  agences: Agence[];
  /** Phase 2 activée pour cette agence (§29). */
  reservationOuverte: boolean;
}) {
  const router = useRouter();
  const [brouillon, setBrouillon] = useState<Brouillon>(VIDE);
  const [edition, setEdition] = useState<string | null>(null);
  const [ouvert, setOuvert] = useState(horaires.length === 0);
  const [erreur, setErreur] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);

  const appel = async (methode: "POST" | "PATCH", charge: unknown) => {
    setErreur(null);
    setOccupe(true);
    try {
      const response = await fetch("/api/backoffice/horaires", {
        method: methode,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(charge),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Enregistrement impossible.");
      router.refresh();
      return true;
    } catch (error) {
      setErreur((error as Error).message);
      return false;
    } finally {
      setOccupe(false);
    }
  };

  const corps = (source: Brouillon) => ({
    villeDepart: source.villeDepart,
    villeArrivee: source.villeArrivee,
    heure: source.heure,
    jours: source.jours,
    prixUsd: source.prixUsd ? toMinor(Number(source.prixUsd)) : null,
    prixCdf: source.prixCdf ? toMinor(Number(source.prixCdf)) : null,
    pointEmbarquement: source.pointEmbarquement,
    gps: source.gps,
    typeVehicule: source.typeVehicule,
    libelleVehicule: source.libelleVehicule,
    dureeMin: source.dureeMin ? Number(source.dureeMin) : null,
    informations: source.informations,
    reservationOuverte: source.reservationOuverte,
    placesEnLigne: Number(source.placesEnLigne || 0),
    agenceId: source.agenceId || null,
  });

  const enregistrer = async () => {
    const ok = edition
      ? await appel("PATCH", { horaireId: edition, mode: "COMPLET", ...corps(brouillon) })
      : await appel("POST", corps(brouillon));
    if (ok) {
      setBrouillon(VIDE);
      setEdition(null);
      setOuvert(false);
    }
  };

  return (
    <div className="space-y-5">
      {erreur && (
        <p role="alert" className="rounded-lg border border-alerte/40 bg-alerte-doux px-3 py-2 text-sm text-alerte">
          {erreur}
        </p>
      )}

      {!ouvert ? (
        <button
          type="button"
          className={buttonClass}
          onClick={() => {
            setBrouillon(VIDE);
            setEdition(null);
            setOuvert(true);
          }}
        >
          Publier un nouveau trajet
        </button>
      ) : (
        <form
          className="space-y-4 rounded-lg border border-bordure bg-surface-alt/40 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            enregistrer();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Ville de départ">
              <input
                required
                className={inputClass}
                value={brouillon.villeDepart}
                onChange={(event) => setBrouillon({ ...brouillon, villeDepart: event.target.value })}
                placeholder="Kinshasa"
              />
            </Field>
            <Field label="Ville d'arrivée">
              <input
                required
                className={inputClass}
                value={brouillon.villeArrivee}
                onChange={(event) => setBrouillon({ ...brouillon, villeArrivee: event.target.value })}
                placeholder="Matadi"
              />
            </Field>
            <Field label="Heure de départ">
              <input
                required
                type="time"
                className={inputClass}
                value={brouillon.heure}
                onChange={(event) => setBrouillon({ ...brouillon, heure: event.target.value })}
              />
            </Field>
            <Field label="Durée estimée" hint="En minutes. Facultatif.">
              <input
                type="number"
                min={0}
                className={inputClass}
                value={brouillon.dureeMin}
                onChange={(event) => setBrouillon({ ...brouillon, dureeMin: event.target.value })}
                placeholder="300"
              />
            </Field>
          </div>

          <fieldset>
            <legend className="mb-1.5 text-xs font-medium text-texte-doux">Jours de circulation</legend>
            <div className="flex flex-wrap gap-1.5">
              {JOURS.map((jour) => {
                const actif = brouillon.jours.includes(jour.value);
                return (
                  <button
                    key={jour.value}
                    type="button"
                    aria-pressed={actif}
                    onClick={() =>
                      setBrouillon({
                        ...brouillon,
                        jours: actif
                          ? brouillon.jours.filter((valeur) => valeur !== jour.value)
                          : [...brouillon.jours, jour.value],
                      })
                    }
                    className={`min-h-11 rounded-lg border px-3 text-sm font-medium transition ${
                      actif
                        ? "border-accent bg-accent text-accent-texte"
                        : "border-bordure bg-surface text-texte-doux hover:border-accent"
                    }`}
                  >
                    {jour.court}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Prix en dollars" hint="Une seule devise suffit.">
              <input
                type="number"
                min={0}
                step="0.01"
                className={inputClass}
                value={brouillon.prixUsd}
                onChange={(event) => setBrouillon({ ...brouillon, prixUsd: event.target.value })}
                placeholder="25"
              />
            </Field>
            <Field label="Prix en francs">
              <input
                type="number"
                min={0}
                className={inputClass}
                value={brouillon.prixCdf}
                onChange={(event) => setBrouillon({ ...brouillon, prixCdf: event.target.value })}
                placeholder="70000"
              />
            </Field>
            <Field label="Type de véhicule">
              <select
                className={inputClass}
                value={brouillon.typeVehicule}
                onChange={(event) =>
                  setBrouillon({ ...brouillon, typeVehicule: event.target.value as VehicleType })
                }
              >
                <option value="BUS">Bus</option>
                <option value="VOITURE">Voiture</option>
              </select>
            </Field>
            <Field label="Précision véhicule" hint="Ex. « Bus climatisé 60 places ».">
              <input
                className={inputClass}
                value={brouillon.libelleVehicule}
                onChange={(event) =>
                  setBrouillon({ ...brouillon, libelleVehicule: event.target.value })
                }
              />
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Point d'embarquement" hint="Où le voyageur doit se présenter.">
              <input
                className={inputClass}
                value={brouillon.pointEmbarquement}
                onChange={(event) =>
                  setBrouillon({ ...brouillon, pointEmbarquement: event.target.value })
                }
                placeholder="Rond-point Ngaba, avenue de la Libération"
              />
            </Field>
            <Field label="Coordonnées GPS" hint="Facultatif : « -4.3421,15.3120 ».">
              <input
                className={inputClass}
                value={brouillon.gps}
                onChange={(event) => setBrouillon({ ...brouillon, gps: event.target.value })}
              />
            </Field>
          </div>

          {agences.length > 0 && (
            <Field label="Agence de départ" hint="Facultatif.">
              <select
                className={inputClass}
                value={brouillon.agenceId}
                onChange={(event) => setBrouillon({ ...brouillon, agenceId: event.target.value })}
              >
                <option value="">Aucune agence précisée</option>
                {agences.map((agence) => (
                  <option key={agence.id} value={agence.id}>
                    {agence.name} — {agence.city}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <Field label="Informations utiles" hint="Bagages, arrêts, conditions. Affiché au voyageur.">
            <textarea
              rows={2}
              className={inputClass}
              value={brouillon.informations}
              onChange={(event) => setBrouillon({ ...brouillon, informations: event.target.value })}
            />
          </Field>

          {reservationOuverte && (
          <div className="rounded-lg border border-bordure bg-surface p-3">
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium">
              <input
                type="checkbox"
                className="champ-coche"
                checked={brouillon.reservationOuverte}
                onChange={() =>
                  setBrouillon({
                    ...brouillon,
                    reservationOuverte: !brouillon.reservationOuverte,
                    placesEnLigne:
                      !brouillon.reservationOuverte && brouillon.placesEnLigne === "0"
                        ? "5"
                        : brouillon.placesEnLigne,
                  })
                }
              />
              Ouvrir des places à la réservation en ligne
            </label>
            {brouillon.reservationOuverte && (
              <div className="mt-3 max-w-xs">
                <Field
                  label="Places proposées sur Mobembo, par départ"
                  hint="Vous gardez le reste de la capacité pour votre guichet."
                >
                  <input
                    type="number"
                    min={1}
                    max={200}
                    className={inputClass}
                    value={brouillon.placesEnLigne}
                    onChange={(event) =>
                      setBrouillon({ ...brouillon, placesEnLigne: event.target.value })
                    }
                  />
                </Field>
              </div>
            )}
          </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button type="submit" className={buttonClass} disabled={occupe}>
              {occupe ? "Enregistrement…" : edition ? "Enregistrer les modifications" : "Publier ce trajet"}
            </button>
            <button
              type="button"
              className={buttonSecondaryClass}
              disabled={occupe}
              onClick={() => {
                setOuvert(false);
                setEdition(null);
                setBrouillon(VIDE);
                setErreur(null);
              }}
            >
              Annuler
            </button>
          </div>
        </form>
      )}

      {horaires.length === 0 ? (
        <p className="rounded-lg border border-dashed border-bordure px-4 py-8 text-center text-sm text-texte-doux">
          Aucun trajet publié. Le premier vous rend visible dans la recherche des voyageurs.
        </p>
      ) : (
        <Table
          headers={
            reservationOuverte
              ? ["Trajet", "Heure", "Jours", "Prix", "Places en ligne", "Réservations", "État", ""]
              : ["Trajet", "Heure", "Jours", "Prix", "État", ""]
          }
        >
          {horaires.map((horaire) => (
            <LigneHoraire
              key={horaire.id}
              horaire={horaire}
              occupe={occupe}
              reservationOuverte={reservationOuverte}
              onEdit={() => {
                setBrouillon(depuis(horaire));
                setEdition(horaire.id);
                setOuvert(true);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              onRapide={(charge) => appel("PATCH", { horaireId: horaire.id, mode: "RAPIDE", ...charge })}
              onStatut={(statut, motif) =>
                appel("PATCH", { horaireId: horaire.id, mode: "STATUT", statut, motif })
              }
            />
          ))}
        </Table>
      )}
    </div>
  );
}

function LigneHoraire({
  horaire,
  occupe,
  reservationOuverte,
  onEdit,
  onRapide,
  onStatut,
}: {
  horaire: CompanyScheduleRow;
  occupe: boolean;
  reservationOuverte: boolean;
  onEdit: () => void;
  onRapide: (charge: { heure?: string; prixUsd?: number | null; placesEnLigne?: number }) => Promise<boolean>;
  onStatut: (statut: ScheduleStatus, motif?: string) => Promise<boolean>;
}) {
  const [rapide, setRapide] = useState(false);
  // §6 : une suspension porte toujours son motif, et le motif est lu par le
  // voyageur — il se saisit donc dans l'écran, pas dans une boîte native.
  const [suspension, setSuspension] = useState<string | null>(null);
  const [heure, setHeure] = useState(horaire.departure_time);
  const [prix, setPrix] = useState(
    horaire.price_usd === null ? "" : String(fromMinor(horaire.price_usd)),
  );
  const [places, setPlaces] = useState(String(horaire.online_quota));

  return (
    <tr className="align-top hover:bg-surface-alt">
      <td className="px-2 py-2">
        <span className="font-medium">
          {horaire.origin_city} → {horaire.destination_city}
        </span>
        {horaire.boarding_point && (
          <span className="block text-[11px] text-texte-doux">{horaire.boarding_point}</span>
        )}
      </td>

      <td className="px-2 py-2 tabular-nums">
        {rapide ? (
          <input
            type="time"
            aria-label="Nouvelle heure de départ"
            className={`${inputClass} w-28`}
            value={heure}
            onChange={(event) => setHeure(event.target.value)}
          />
        ) : (
          horaire.departure_time
        )}
      </td>

      <td className="px-2 py-2 text-xs text-texte-doux">
        {formatDays(parseDays(horaire.days_of_week))}
      </td>

      <td className="px-2 py-2 tabular-nums">
        {rapide ? (
          <input
            type="number"
            min={0}
            step="0.01"
            aria-label="Nouveau prix en dollars"
            className={`${inputClass} w-24`}
            value={prix}
            onChange={(event) => setPrix(event.target.value)}
          />
        ) : horaire.price_usd !== null ? (
          formatMoney(horaire.price_usd, "USD")
        ) : horaire.price_cdf !== null ? (
          formatMoney(horaire.price_cdf, "CDF")
        ) : (
          "—"
        )}
      </td>

      {reservationOuverte && (
      <>
      <td className="px-2 py-2 tabular-nums">
        {rapide && horaire.booking_enabled === 1 ? (
          <input
            type="number"
            min={0}
            max={200}
            aria-label="Places ouvertes en ligne"
            className={`${inputClass} w-20`}
            value={places}
            onChange={(event) => setPlaces(event.target.value)}
          />
        ) : horaire.booking_enabled === 1 ? (
          `${horaire.online_quota} / départ`
        ) : (
          <span className="text-texte-doux">Fermée</span>
        )}
      </td>

      <td className="px-2 py-2 tabular-nums">
        {horaire.reservationsAVenir > 0 ? (
          <span>
            {horaire.reservationsAVenir}
            <span className="block text-[11px] text-texte-doux">{horaire.placesAVenir} places</span>
          </span>
        ) : (
          <span className="text-texte-doux">—</span>
        )}
      </td>
      </>
      )}

      <td className="px-2 py-2">
        {horaire.status === "PUBLIE" ? (
          <Badge tone="succes">Publié</Badge>
        ) : (
          <Badge tone="attention">Suspendu</Badge>
        )}
        {horaire.suspended_reason && (
          <span className="mt-1 block max-w-40 text-[11px] text-texte-doux">
            {horaire.suspended_reason}
          </span>
        )}
      </td>

      <td className="px-2 py-2 text-right">
        {suspension !== null && (
          <div className="mb-2 rounded-lg border border-attention/30 bg-attention-doux p-2.5 text-left">
            <label className="block text-[11px] font-semibold text-attention">
              Motif affiché aux voyageurs
              <input
                autoFocus
                className={`${inputClass} mt-1`}
                value={suspension}
                onChange={(event) => setSuspension(event.target.value)}
              />
            </label>
            <div className="mt-2 flex gap-1.5">
              <button
                type="button"
                disabled={occupe || !suspension.trim()}
                className="rounded-lg bg-attention px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
                onClick={async () => {
                  const ok = await onStatut("SUSPENDU", suspension);
                  if (ok) setSuspension(null);
                }}
              >
                Suspendre
              </button>
              <button
                type="button"
                className="rounded-lg border border-bordure bg-surface px-3 py-1.5 text-xs font-medium transition hover:bg-surface-alt"
                onClick={() => setSuspension(null)}
              >
                Annuler
              </button>
            </div>
          </div>
        )}
        <div className="flex flex-wrap justify-end gap-1.5">
          {rapide ? (
            <>
              <button
                type="button"
                disabled={occupe}
                className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-texte transition hover:brightness-110 disabled:opacity-50"
                onClick={async () => {
                  const ok = await onRapide({
                    heure,
                    prixUsd: prix ? toMinor(Number(prix)) : null,
                    placesEnLigne: horaire.booking_enabled === 1 ? Number(places || 0) : undefined,
                  });
                  if (ok) setRapide(false);
                }}
              >
                Enregistrer
              </button>
              <button
                type="button"
                className="rounded-lg border border-bordure px-3 py-1.5 text-xs font-medium transition hover:bg-surface-alt"
                onClick={() => {
                  setRapide(false);
                  setHeure(horaire.departure_time);
                  setPrix(horaire.price_usd === null ? "" : String(fromMinor(horaire.price_usd)));
                  setPlaces(String(horaire.online_quota));
                }}
              >
                Annuler
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="rounded-lg border border-bordure px-3 py-1.5 text-xs font-semibold text-navy transition hover:border-accent hover:text-accent"
                onClick={() => setRapide(true)}
              >
                Prix / heure
              </button>
              <button
                type="button"
                className="rounded-lg border border-bordure px-3 py-1.5 text-xs font-medium transition hover:bg-surface-alt"
                onClick={onEdit}
              >
                Modifier
              </button>
              {horaire.status === "PUBLIE" ? (
                <button
                  type="button"
                  disabled={occupe}
                  className="rounded-lg border border-bordure px-3 py-1.5 text-xs font-medium text-texte-doux transition hover:border-attention hover:text-attention disabled:opacity-50"
                  onClick={() => setSuspension("Départ suspendu temporairement")}
                >
                  Suspendre
                </button>
              ) : (
                <button
                  type="button"
                  disabled={occupe}
                  className="rounded-lg border border-bordure px-3 py-1.5 text-xs font-medium transition hover:border-succes hover:text-succes disabled:opacity-50"
                  onClick={() => onStatut("PUBLIE")}
                >
                  Republier
                </button>
              )}
            </>
          )}
        </div>
      </td>
    </tr>
  );
}
