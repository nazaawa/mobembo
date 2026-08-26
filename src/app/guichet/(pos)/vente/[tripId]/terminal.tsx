"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { SeatMap, type SeatView } from "@/components/seat-map";
import {
  Card,
  Field,
  Stat,
  Why,
  Money,
  Badge,
  inputClass,
  buttonClass,
  buttonSecondaryClass,
} from "@/components/ui";
import { formatMoney, type Currency } from "@/lib/core/money";
import {
  deviceId,
  ecrireQuota,
  lireQuota,
  restantLocal,
  consommerLocal,
  empiler,
  nouvelOpId,
  ajouterBilletLocal,
  type QuotaLocal,
} from "@/lib/client/offline";
import { useEnLigne, useStockageLocal } from "@/lib/client/store";
import type { SeatAvailability } from "@/lib/domain/seats";

interface BilletEmis {
  id: string | null;
  code: string;
  siege: string;
  passager: string;
  sequence: number | null;
  horsLigne: boolean;
}

interface VenteEmise {
  /** Réservation à imprimer ; absente tant qu'une vente hors-ligne n'est pas synchronisée. */
  reservationId: string | null;
  billets: BilletEmis[];
}

/**
 * Terminal de vente guichet (§2.4).
 *
 * Deux modes, un seul parcours : en ligne, la vente part au serveur et revient
 * avec son numéro de séquence ; hors-ligne, elle est encaissée dans la limite
 * du quota local pré-alloué puis mise en file. L'agent voit lequel des deux
 * s'applique, mais ne change rien à sa manière de travailler.
 */
export function TerminalVente({
  tripId,
  caisseId,
  deviseCaisse,
  rows,
  layoutColumns,
  seats,
  prixUsd,
  prixCdf,
  disponibilite,
  trajet,
}: {
  tripId: string;
  caisseId: string;
  deviseCaisse: Currency;
  rows: number;
  layoutColumns: string[];
  seats: SeatView[];
  prixUsd: number;
  prixCdf: number;
  disponibilite: SeatAvailability[];
  trajet: { ligne: string; depart: string; plaque: string; categorie: string };
}) {
  const router = useRouter();
  const enLigne = useEnLigne();
  const lireQuotaLocal = useCallback(() => lireQuota(tripId), [tripId]);
  const quota = useStockageLocal(lireQuotaLocal, null);
  const [selection, setSelection] = useState<string[]>([]);
  const [nom, setNom] = useState("");
  const [telephone, setTelephone] = useState("");
  const [devise, setDevise] = useState<Currency>(deviseCaisse);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [emis, setEmis] = useState<VenteEmise | null>(null);

  const guichet = disponibilite.find((a) => a.channel === "GUICHET");
  const prixUnitaire = devise === "USD" ? prixUsd : prixCdf;
  const total = prixUnitaire * selection.length;

  /**
   * §2.4 : « Le POS conserve en local le quota guichet du jour. » Le
   * téléchargement est explicite : l'agent choisit quel départ il pourra
   * continuer à vendre si le réseau tombe.
   */
  const telechargerQuota = () => {
    const disponibles = seats
      .filter((seat) => seat.canal === "GUICHET" && seat.statut === "DISPONIBLE")
      .map((seat) => seat.numero);
    const nouveau: QuotaLocal = {
      tripId,
      siegesDisponibles: disponibles,
      siegesConsommes: [],
      telechargeA: new Date().toISOString(),
      trajet: {
        ...trajet,
        prixUsd,
        prixCdf,
        rangees: rows,
        colonnes: layoutColumns,
        siegesParCanal: seats.map((s) => ({
          numero: s.numero,
          canal: s.canal,
          statut: s.statut,
        })),
      },
    };
    ecrireQuota(nouveau);
  };

  const restant = useMemo(() => (quota ? restantLocal(quota) : []), [quota]);

  // Hors-ligne, seuls les sièges du quota téléchargé et non encore consommés
  // sont vendables : c'est ce qui rend le surbooking impossible (§2.3).
  const siegesAffichés: SeatView[] = useMemo(() => {
    if (enLigne || !quota) return seats;
    const vendables = new Set(restant);
    return seats.map((seat) =>
      seat.canal === "GUICHET" && seat.statut === "DISPONIBLE" && !vendables.has(seat.numero)
        ? { ...seat, statut: "VENDU" as const }
        : seat,
    );
  }, [enLigne, quota, seats, restant]);

  const vendre = async () => {
    if (selection.length === 0 || !nom.trim() || !telephone.trim()) return;
    setErreur(null);
    setOccupe(true);

    const clientOpId = nouvelOpId();
    const passagers = selection.map((seatNumber) => ({ seatNumber, name: nom.trim() }));
    const vente = {
      clientOpId,
      clientTime: new Date().toISOString(),
      tripId,
      sieges: selection,
      passagers,
      telephone: telephone.trim(),
      nom: nom.trim(),
      caisseId,
      devise,
      montant: total,
    };

    try {
      if (!navigator.onLine) {
        // Vente hors-ligne : bornée au quota local, encaissée, mise en file.
        const vendables = new Set(restant);
        const refuses = selection.filter((seat) => !vendables.has(seat));
        if (refuses.length > 0) {
          throw new Error(
            `Sièges ${refuses.join(", ")} hors de votre quota local. Hors-ligne, vous ne pouvez ` +
              "vendre que les sièges pré-alloués — c'est ce qui empêche de vendre deux fois le même.",
          );
        }
        empiler(vente);
        consommerLocal(tripId, selection);
        for (const seat of selection) {
          ajouterBilletLocal({
            clientOpId,
            code: "— en attente de synchronisation —",
            siege: seat,
            passager: nom.trim(),
            emisA: vente.clientTime,
            synchronise: false,
          });
        }
        setEmis({
          reservationId: null,
          billets: selection.map((seat) => ({
            id: null,
            code: "à synchroniser",
            siege: seat,
            passager: nom.trim(),
            sequence: null,
            horsLigne: true,
          })),
        });
      } else {
        const response = await fetch("/api/guichet/vente", {
          method: "POST",
          headers: { "content-type": "application/json", "x-mobembo-device": deviceId() },
          body: JSON.stringify(vente),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message ?? "Vente refusée.");
        setEmis({
          reservationId: (data.reservation as { id: string }).id,
          billets: (data.billets as Array<{
            id: string;
            ticket_code: string;
            sequence_number: number | null;
            passenger_name: string;
          }>).map((billet, index) => ({
            id: billet.id,
            code: billet.ticket_code,
            siege: selection[index],
            passager: billet.passenger_name,
            sequence: billet.sequence_number,
            horsLigne: false,
          })),
        });
        router.refresh();
      }
      setSelection([]);
      setNom("");
      setTelephone("");
    } catch (error) {
      setErreur((error as Error).message);
      if (navigator.onLine) router.refresh();
    } finally {
      setOccupe(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      <Card
        title="Plan de sièges"
        subtitle="Seuls les sièges du quota guichet sont vendables ici."
        actions={
          <button
            type="button"
            className={buttonSecondaryClass}
            onClick={telechargerQuota}
            title="Conserve le quota guichet de ce départ pour vendre sans réseau"
          >
            {quota ? "Rafraîchir le quota hors-ligne" : "Télécharger pour hors-ligne"}
          </button>
        }
      >
        <SeatMap
          layoutColumns={layoutColumns}
          rows={rows}
          seats={siegesAffichés}
          channel="GUICHET"
          selected={selection}
          onToggle={(seat) =>
            setSelection((current) =>
              current.includes(seat) ? current.filter((s) => s !== seat) : [...current, seat],
            )
          }
        />
        <div className="mt-4">
          <Why>
            Les sièges grisés appartiennent au quota vendu en ligne. Ils ne sont pas cliquables :
            c&apos;est cette séparation qui permet de continuer à vendre ici quand internet tombe,
            sans jamais vendre deux fois le même siège.
          </Why>
        </div>
      </Card>

      <div className="space-y-4 lg:sticky lg:top-24">
        {!enLigne && (
          <div className="rounded-lg border border-attention/40 bg-attention-doux px-3 py-2.5 text-sm text-attention">
            <p className="font-semibold">Mode hors-ligne</p>
            {quota ? (
              <p className="mt-1">
                <strong className="tabular-nums">{restant.length}</strong> siège(s) restants sur
                votre quota local.
              </p>
            ) : (
              <p className="mt-1">
                Aucun quota téléchargé pour ce départ : la vente est impossible tant que le réseau
                n&apos;est pas revenu. Aucun carnet papier de secours n&apos;est prévu — c&apos;est
                volontaire.
              </p>
            )}
          </div>
        )}

        <Card title="Encaisser">
          {erreur && (
            <p className="mb-3 rounded-lg border border-alerte/40 bg-alerte-doux px-3 py-2 text-sm text-alerte">
              {erreur}
            </p>
          )}

          <div className="space-y-3">
            <Field label="Nom du passager">
              <input
                className={inputClass}
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                placeholder="Nom et prénom"
              />
            </Field>
            <Field label="Téléphone" hint="Le SMS de confirmation part sur ce numéro.">
              <input
                className={inputClass}
                inputMode="tel"
                value={telephone}
                onChange={(e) => setTelephone(e.target.value)}
                placeholder="081 234 5678"
              />
            </Field>
            <Field label="Devise encaissée">
              <select
                className={inputClass}
                value={devise}
                onChange={(e) => setDevise(e.target.value as Currency)}
              >
                <option value="USD">USD</option>
                <option value="CDF">CDF</option>
              </select>
            </Field>
          </div>

          <dl className="mt-3 space-y-1 rounded-lg bg-surface-alt px-3 py-2.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-texte-doux">Sièges</dt>
              <dd className="tabular-nums">{selection.join(", ") || "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-texte-doux">Prix unitaire</dt>
              <dd>
                <Money amount={prixUnitaire} currency={devise} />
              </dd>
            </div>
            <div className="flex justify-between text-base font-semibold">
              <dt>À encaisser</dt>
              <dd>{formatMoney(total, devise)}</dd>
            </div>
          </dl>

          <button
            type="button"
            className={`${buttonClass} mt-3 w-full`}
            disabled={selection.length === 0 || !nom.trim() || !telephone.trim() || occupe}
            onClick={vendre}
          >
            {occupe ? "…" : `Encaisser ${formatMoney(total, devise)}`}
          </button>

          <p className="mt-2 text-[11px] text-texte-doux">
            Le prix vient de la grille tarifaire du trajet. Il n&apos;est pas modifiable au
            guichet.
          </p>
        </Card>

        {guichet && (
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Quota guichet" value={guichet.quota} />
            <Stat
              label="Libres"
              value={guichet.disponibles}
              tone={guichet.disponibles === 0 ? "alerte" : "succes"}
            />
          </div>
        )}

        {emis && emis.billets.length > 0 && (
          <Card
            title="Billets émis"
            subtitle="Remettez le reçu au passager."
            actions={
              emis.reservationId ? (
                <a
                  href={`/guichet/recu/${emis.reservationId}?auto=1`}
                  target="_blank"
                  rel="noopener"
                  className={buttonClass}
                >
                  Imprimer le reçu
                </a>
              ) : null
            }
          >
            <ul className="space-y-2 text-sm">
              {emis.billets.map((billet, index) => (
                <li
                  key={index}
                  className="rounded-lg border border-succes/40 bg-succes-doux px-3 py-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-semibold">{billet.code}</span>
                    {billet.horsLigne ? (
                      <Badge tone="attention">hors-ligne</Badge>
                    ) : (
                      <Badge tone="succes">#{billet.sequence}</Badge>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center justify-between gap-2">
                    <span className="text-xs text-texte-doux">
                      Siège {billet.siege} · {billet.passager}
                    </span>
                    {emis.reservationId && billet.id && emis.billets.length > 1 && (
                      <a
                        href={`/guichet/recu/${emis.reservationId}?billet=${billet.id}&auto=1`}
                        target="_blank"
                        rel="noopener"
                        className="text-[11px] text-accent underline"
                      >
                        imprimer seul
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {emis.billets.some((b) => b.horsLigne) && (
              <p className="mt-2 text-[11px] text-attention">
                Ces billets recevront leur numéro et leur QR au retour du réseau. Notez le siège et
                le nom sur le reçu papier de la compagnie en attendant.
              </p>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
