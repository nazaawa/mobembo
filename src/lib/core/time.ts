/**
 * §3.1 : « Horodatage serveur autoritaire. Aucune décision d'état ne dépend de
 * l'horloge d'un appareil. » Tout le domaine passe par ces helpers ; l'heure
 * envoyée par un POS ou un terminal contrôleur n'est jamais qu'une donnée
 * informative stockée à côté de l'heure serveur.
 */
export function now(): Date {
  return new Date();
}

export function nowIso(): string {
  return now().toISOString();
}

export function iso(date: Date): string {
  return date.toISOString();
}

export function plusMinutes(minutes: number, from: Date = now()): string {
  return new Date(from.getTime() + minutes * 60_000).toISOString();
}

export function plusDays(days: number, from: Date = now()): string {
  return new Date(from.getTime() + days * 86_400_000).toISOString();
}

/** Jour calendaire utilisé par les écrans et recherches en RDC (UTC+1, sans DST). */
export function todayInKinshasa(from: Date = now()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Kinshasa",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(from);
}

/** Heure locale (0-23) à Kinshasa, utilisée pour classer les départs par période. */
export function hourInKinshasa(isoDate: string): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Africa/Kinshasa",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(new Date(isoDate)),
  );
}

export function minutesUntil(isoDate: string, from: Date = now()): number {
  return (new Date(isoDate).getTime() - from.getTime()) / 60_000;
}

export function hoursUntil(isoDate: string, from: Date = now()): number {
  return minutesUntil(isoDate, from) / 60;
}

export function isPast(isoDate: string | null | undefined, from: Date = now()): boolean {
  if (!isoDate) return false;
  return new Date(isoDate).getTime() <= from.getTime();
}

/** Fenêtre [début, fin[ d'un jour calendaire de Kinshasa, en ISO. */
export function dayBounds(day: string): { start: string; end: string } {
  const start = new Date(`${day}T00:00:00.000+01:00`);
  const end = new Date(start.getTime() + 86_400_000);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function formatDateTime(isoDate: string, locale = "fr-CD"): string {
  return new Date(isoDate).toLocaleString(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Kinshasa",
  });
}

export function formatTime(isoDate: string, locale = "fr-CD"): string {
  return new Date(isoDate).toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Kinshasa",
  });
}

/**
 * Décalage fixe de Kinshasa (UTC+1, sans heure d'été). Les services réguliers
 * de la phase 1 sont annoncés en heure locale ("08:00") et n'ont pas de date :
 * la date vient de la recherche du voyageur, l'instant se recompose ici.
 */
export const KINSHASA_OFFSET = "+01:00";

/** "2026-09-15" + "08:00" → instant ISO UTC du départ annoncé. */
export function departureIso(day: string, time: string): string {
  return new Date(`${day}T${time}:00.000${KINSHASA_OFFSET}`).toISOString();
}

/** Jour ISO d'un jour calendaire : 1 = lundi … 7 = dimanche. */
export function isoWeekday(day: string): number {
  const weekday = new Date(`${day}T12:00:00.000${KINSHASA_OFFSET}`).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

/** Jour calendaire décalé de n jours, en heure de Kinshasa. */
export function addDays(day: string, count: number): string {
  const base = new Date(`${day}T12:00:00.000${KINSHASA_OFFSET}`);
  return todayInKinshasa(new Date(base.getTime() + count * 86_400_000));
}

export function formatDay(day: string, locale = "fr-CD"): string {
  return new Date(`${day}T12:00:00.000${KINSHASA_OFFSET}`).toLocaleDateString(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Africa/Kinshasa",
  });
}

/**
 * §6 : « Les informations visibles doivent afficher leur dernière date de mise
 * à jour. » Un voyageur juge la fraîcheur d'un horaire à l'échelle du jour,
 * pas de la minute.
 */
export function freshness(isoDate: string, from: Date = now()): string {
  const days = Math.floor((from.getTime() - new Date(isoDate).getTime()) / 86_400_000);
  if (days <= 0) return "aujourd’hui";
  if (days === 1) return "hier";
  if (days < 7) return `il y a ${days} jours`;
  if (days < 14) return "il y a une semaine";
  if (days < 60) return `il y a ${Math.floor(days / 7)} semaines`;
  return `il y a ${Math.floor(days / 30)} mois`;
}

/** Horodatage ISO de N jours en arrière — borne basse des fenêtres d'indicateurs. */
export function daysAgo(days: number, from: Date = now()): string {
  return new Date(from.getTime() - days * 86_400_000).toISOString();
}
