import type { SeatMapLayout } from "./types";

/**
 * §2.1 : « Le plan de sièges est un gabarit réutilisable […] Aucun plan codé
 * en dur. » Les numéros de siège se déduisent du gabarit, jamais d'une
 * constante : une compagnie qui numérote 1A/1B doit pouvoir le faire.
 */
export const AISLE = "aisle";

export function seatNumbersFor(
  rows: number,
  layout: SeatMapLayout,
  disabledSeats: string[] = [],
): string[] {
  const disabled = new Set(disabledSeats);
  const seats: string[] = [];
  for (let row = 1; row <= rows; row++) {
    for (const column of layout.columns) {
      if (column === AISLE) continue;
      const seat = `${row}${column}`;
      if (!disabled.has(seat)) seats.push(seat);
    }
  }
  return seats;
}

export function seatCountFor(
  rows: number,
  layout: SeatMapLayout,
  disabledSeats: string[] = [],
): number {
  return seatNumbersFor(rows, layout, disabledSeats).length;
}

/** Grille d'affichage : une ligne par rangée, `null` pour le couloir. */
export function seatGrid(
  rows: number,
  layout: SeatMapLayout,
  disabledSeats: string[] = [],
): (string | null)[][] {
  const disabled = new Set(disabledSeats);
  const grid: (string | null)[][] = [];
  for (let row = 1; row <= rows; row++) {
    grid.push(
      layout.columns.map((column) => {
        if (column === AISLE) return null;
        const seat = `${row}${column}`;
        return disabled.has(seat) ? null : seat;
      }),
    );
  }
  return grid;
}

/** Dispositions courantes proposées à l'éditeur graphique. */
export const LAYOUT_PRESETS: Record<string, SeatMapLayout> = {
  "2+2": { columns: ["A", "B", AISLE, "C", "D"] },
  "2+3": { columns: ["A", "B", AISLE, "C", "D", "E"] },
  "1+2": { columns: ["A", AISLE, "B", "C"] },
};
