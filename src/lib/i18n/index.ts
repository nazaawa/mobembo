/**
 * §3.1 : « i18n : français par défaut, lingala et swahili prévus dans
 * l'architecture dès le départ, même sans traduction en v1. »
 *
 * Les catalogues lingala et swahili existent et sont vides : la mécanique de
 * repli est en place et testée, il ne restera qu'à les remplir. Prévoir la
 * traduction après coup coûte toujours plus cher que de la câbler au départ.
 */
export const LOCALES = ["fr", "ln", "sw"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "fr";

export const LOCALE_LABELS: Record<Locale, string> = {
  fr: "Français",
  ln: "Lingala",
  sw: "Swahili",
};

type Catalogue = Record<string, string>;

const fr: Catalogue = {
  "recherche.titre": "Où allez-vous ?",
  "recherche.depart": "Ville de départ",
  "recherche.arrivee": "Ville d'arrivée",
  "recherche.date": "Date du voyage",
  "recherche.chercher": "Rechercher",
  "resultat.places": "places en ligne",
  "resultat.choisir": "Choisir",
  "siege.titre": "Choisissez votre siège",
  "siege.verrou": "Siège maintenu",
  "paiement.titre": "Paiement Mobile Money",
  "billet.titre": "Votre billet",
  "commun.retour": "Retour",
  "commun.continuer": "Continuer",
};

// Catalogues à remplir en phase 2/3 ; le repli sur le français est immédiat.
const ln: Catalogue = {};
const sw: Catalogue = {};

const CATALOGUES: Record<Locale, Catalogue> = { fr, ln, sw };

export function t(key: string, locale: Locale = DEFAULT_LOCALE): string {
  return CATALOGUES[locale][key] ?? CATALOGUES[DEFAULT_LOCALE][key] ?? key;
}

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}
