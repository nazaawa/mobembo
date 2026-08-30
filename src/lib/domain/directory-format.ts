/**
 * Mise en forme de l'annuaire, sans accès base : l'annuaire public se filtre
 * dans un composant client, qui ne doit embarquer ni MySQL ni la session.
 */

/**
 * Une agence peut être active sur Mobembo de deux façons : en publiant des
 * horaires (phase 1) ou en programmant des départs vendus en ligne (phases 3+).
 * Afficher « 0 horaire » à une compagnie qui a soixante départs à venir serait
 * faux, d'où cette phrase unique qui dit ce que l'agence a réellement publié.
 */
export function activiteAgence(entry: { horaires: number; departsPlanifies: number }): string {
  if (entry.horaires > 0) {
    return `${entry.horaires} horaire${entry.horaires > 1 ? "s" : ""} publié${entry.horaires > 1 ? "s" : ""}`;
  }
  if (entry.departsPlanifies > 0) {
    return `${entry.departsPlanifies} départ${entry.departsPlanifies > 1 ? "s" : ""} programmé${entry.departsPlanifies > 1 ? "s" : ""}`;
  }
  return "Aucun départ publié";
}
