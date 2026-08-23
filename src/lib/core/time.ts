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
