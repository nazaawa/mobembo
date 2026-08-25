"use client";

import { useMemo } from "react";
import type { Channel, SeatStatus } from "@/lib/domain/types";

export interface SeatView {
  numero: string;
  statut: SeatStatus;
  canal: Channel;
  remisEnVente?: boolean;
  listingId?: string | null;
}

/**
 * Plan de sièges interactif. Il sert au guichet (§2.4.2) comme au passager
 * (§2.5.3), avec la même règle : les sièges d'un autre canal sont **visibles
 * mais non cliquables**. Le guichetier doit voir qu'un siège existe et qu'il
 * est réservé à la vente en ligne — sinon il croit à un bug et cherche à
 * contourner.
 */
export function SeatMap({
  layoutColumns,
  rows,
  seats,
  channel,
  selected,
  onToggle,
  disabled = false,
}: {
  layoutColumns: string[];
  rows: number;
  seats: SeatView[];
  /** Canal de l'opérateur courant : seuls ces sièges sont cliquables. */
  channel: Channel;
  selected: string[];
  onToggle: (seat: string) => void;
  disabled?: boolean;
}) {
  const bySeat = useMemo(() => new Map(seats.map((s) => [s.numero, s])), [seats]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-[11px] text-texte-doux">
        <span>Avant du bus</span>
        <span aria-hidden>▲</span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-bordure bg-surface-alt p-3">
        <div className="mx-auto w-max">
        <div className="flex flex-col gap-1.5">
          {Array.from({ length: rows }, (_, index) => index + 1).map((row) => (
            <div key={row} className="flex items-center gap-1.5">
              <span className="w-5 text-right text-[10px] tabular-nums text-texte-doux">{row}</span>
              {layoutColumns.map((column, columnIndex) => {
                if (column === "aisle") {
                  return <span key={`aisle-${columnIndex}`} className="w-4" aria-hidden />;
                }
                const numero = `${row}${column}`;
                const seat = bySeat.get(numero);
                if (!seat) {
                  // Siège désactivé au plan (porte, moteur) : un vide, pas un bouton.
                  return (
                    <span
                      key={numero}
                      className="h-9 w-9 rounded-md border border-dashed border-bordure/60"
                      aria-hidden
                    />
                  );
                }
                return (
                  <SeatButton
                    key={numero}
                    seat={seat}
                    channel={channel}
                    selected={selectedSet.has(numero)}
                    disabled={disabled}
                    onToggle={onToggle}
                  />
                );
              })}
            </div>
          ))}
        </div>
        </div>
      </div>

      <Legend />
    </div>
  );
}

function SeatButton({
  seat,
  channel,
  selected,
  disabled,
  onToggle,
}: {
  seat: SeatView;
  channel: Channel;
  selected: boolean;
  disabled: boolean;
  onToggle: (seat: string) => void;
}) {
  const autreCanal = seat.canal !== channel;
  const libre = seat.statut === "DISPONIBLE";
  const achetableEnRevente = seat.remisEnVente && channel === "EN_LIGNE";
  const cliquable = !disabled && !autreCanal && (libre || achetableEnRevente);

  let tone = "border-bordure bg-surface text-texte-doux";
  let titre = `Siège ${seat.numero}`;

  if (selected) {
    tone = "border-accent bg-accent text-accent-texte font-semibold";
    titre += " — sélectionné";
  } else if (achetableEnRevente) {
    tone = "border-attention bg-attention-doux text-attention font-medium";
    titre += " — remis en vente par un passager";
  } else if (autreCanal) {
    tone = "border-bordure/60 bg-surface-alt text-texte-doux/50";
    titre += ` — quota ${seat.canal}, non vendable sur ce canal`;
  } else if (seat.statut === "DISPONIBLE") {
    tone = "border-accent/40 bg-accent-doux text-accent";
    titre += " — libre";
  } else if (seat.statut === "VERROUILLE") {
    tone = "border-attention/50 bg-attention-doux text-attention";
    titre += " — en cours de paiement";
  } else if (seat.statut === "VENDU" || seat.statut === "EMBARQUE") {
    tone = "border-bordure bg-surface-alt text-texte-doux line-through";
    titre += seat.statut === "EMBARQUE" ? " — embarqué" : " — vendu";
  } else if (seat.statut === "BLOQUE_ADMIN") {
    tone = "border-bordure bg-surface-alt text-texte-doux";
    titre += " — bloqué (réservé compagnie)";
  }

  return (
    <button
      type="button"
      title={titre}
      aria-label={titre}
      aria-pressed={selected}
      disabled={!cliquable}
      onClick={() => onToggle(seat.numero)}
      className={`h-11 w-11 rounded-[8px] border text-[11px] tabular-nums transition ${tone} ${
        cliquable ? "cursor-pointer hover:brightness-95 focus-visible:ring-2 focus-visible:ring-accent/30" : "cursor-not-allowed"
      }`}
    >
      {seat.numero}
    </button>
  );
}

function Legend() {
  const items: Array<{ label: string; className: string }> = [
    { label: "Libre", className: "border-accent/40 bg-accent-doux" },
    { label: "Sélectionné", className: "border-accent bg-accent" },
    { label: "En paiement", className: "border-attention/50 bg-attention-doux" },
    { label: "Vendu", className: "border-bordure bg-surface-alt" },
    { label: "Remis en vente", className: "border-attention bg-attention-doux" },
    { label: "Autre canal", className: "border-bordure/60 bg-surface-alt opacity-50" },
  ];
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-texte-doux">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span className={`h-3 w-3 rounded border ${item.className}`} aria-hidden />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
