/**
 * Liens externes utilisés par les fiches agence et horaire (§4.5 : appeler,
 * WhatsApp, itinéraire).
 *
 * Module volontairement pur : ces fonctions sont appelées depuis des
 * composants clients, qui ne doivent embarquer ni la base de données ni le
 * domaine dans le bundle du navigateur.
 */

/** Lien WhatsApp officiel à partir d'un numéro normalisé (+243…). */
export function whatsappLink(phone: string, message?: string): string {
  const digits = phone.replace(/\D/g, "");
  const suffix = message ? `?text=${encodeURIComponent(message)}` : "";
  return `https://wa.me/${digits}${suffix}`;
}

/** §4.5 : « obtenir l'itinéraire vers le point de départ ». */
export function directionsLink(query: string): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}`;
}
