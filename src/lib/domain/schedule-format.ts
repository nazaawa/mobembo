/**
 * Mise en forme des services réguliers, sans accès base.
 *
 * Le back-office édite les jours de circulation dans un composant client :
 * ces helpers doivent donc vivre hors de `schedules.ts`, qui ouvre la
 * connexion MySQL et n'a rien à faire dans un bundle navigateur.
 */

export const JOURS = [
  { value: 1, court: "Lun", long: "lundi" },
  { value: 2, court: "Mar", long: "mardi" },
  { value: 3, court: "Mer", long: "mercredi" },
  { value: 4, court: "Jeu", long: "jeudi" },
  { value: 5, court: "Ven", long: "vendredi" },
  { value: 6, court: "Sam", long: "samedi" },
  { value: 7, court: "Dim", long: "dimanche" },
] as const;

/** "1,3,5" → [1, 3, 5], en écartant tout ce qui n'est pas un jour ISO. */
export function parseDays(raw: string): number[] {
  return raw
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value >= 1 && value <= 7)
    .sort((a, b) => a - b);
}

export function formatDays(days: number[]): string {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  if (sorted.length === 7) return "Tous les jours";
  if (sorted.length === 0) return "Aucun jour";
  if (sorted.join(",") === "1,2,3,4,5") return "Du lundi au vendredi";
  if (sorted.join(",") === "1,2,3,4,5,6") return "Du lundi au samedi";
  if (sorted.join(",") === "6,7") return "Week-end";
  return sorted.map((day) => JOURS[day - 1].court).join(" · ");
}
