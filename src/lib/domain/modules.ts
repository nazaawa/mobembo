/**
 * Modules d'une agence — la phase activée, écran par écran.
 *
 * Note fonctionnelle, §29 : « Les fonctions affichées dépendent du rôle et de
 * la phase activée pour l'agence. » Une agence qui vient d'être référencée n'a
 * aucune raison de voir un plan de sièges, une caisse ou une grille de
 * renoncement : ces écrans ne lui servent pas encore, et leur seul effet est de
 * lui faire croire qu'elle doit tout comprendre avant de commencer.
 *
 * L'ouverture est décidée par l'équipe Mobembo, agence par agence, quand
 * l'agence en exprime le besoin (§33 : « une nouvelle phase ne doit pas être
 * lancée uniquement parce qu'elle est prévue dans la feuille de route »).
 *
 * Ce module est pur : il est importé par des composants clients pour les
 * libellés, il ne doit donc jamais toucher la base.
 */

/** Le référencement (phase 1) n'est pas un module : c'est le socle, toujours actif. */
export type CompanyModule = "RESERVATION" | "PAIEMENT" | "ERP" | "CONTROLE";

export const COMPANY_MODULES: CompanyModule[] = [
  "RESERVATION",
  "PAIEMENT",
  "ERP",
  "CONTROLE",
];

export interface ModuleDescription {
  phase: number;
  label: string;
  /** Ce que l'agence gagne, dit en une phrase à un non-informaticien. */
  apport: string;
  /** Ce que l'agence doit être prête à faire — le vrai coût de l'ouverture. */
  exigence: string;
  ecrans: string[];
}

export const MODULE_DETAILS: Record<CompanyModule, ModuleDescription> = {
  RESERVATION: {
    phase: 2,
    label: "Réservation en ligne",
    apport:
      "Vous ouvrez quelques places par départ sur Mobembo. Les voyageurs les retiennent à l'avance et paient chez vous.",
    exigence: "Consulter la liste des réservations avant chaque départ.",
    ecrans: ["Réservations"],
  },
  PAIEMENT: {
    phase: 3,
    label: "Paiement en ligne",
    apport:
      "Le voyageur paie sa réservation par Mobile Money et reçoit un billet numérique avec QR. Vous encaissez avant le départ.",
    exigence:
      "Accepter une commission de 10 % sur les billets payés via Mobembo, et honorer les billets présentés au départ.",
    ecrans: ["Paiements et billets", "Reversements"],
  },
  ERP: {
    phase: 4,
    label: "Gestion d'agence",
    apport:
      "Véhicules, plans de sièges, départs datés, vente au guichet, caisses et rapports de recettes.",
    exigence: "Que toute vente passe par le système, guichet compris.",
    ecrans: ["Planification", "Référentiel", "Guichet", "Rapports", "Journal d'audit"],
  },
  CONTROLE: {
    phase: 5,
    label: "Contrôle à l'embarquement",
    apport: "Scan des billets au départ, y compris sans réseau.",
    exigence: "Un appareil par contrôleur, synchronisé avant le départ.",
    ecrans: ["Application contrôleur"],
  },
};

export const MODULE_LABELS: Record<CompanyModule, string> = {
  RESERVATION: MODULE_DETAILS.RESERVATION.label,
  PAIEMENT: MODULE_DETAILS.PAIEMENT.label,
  ERP: MODULE_DETAILS.ERP.label,
  CONTROLE: MODULE_DETAILS.CONTROLE.label,
};

/**
 * Ce que reçoit une agence nouvellement référencée : la phase 2 et rien de
 * plus. Elle peut publier ses trajets, ouvrir des places si elle le souhaite,
 * et n'a aucun écran d'exploitation sous les yeux.
 */
export const MODULES_PAR_DEFAUT: CompanyModule[] = ["RESERVATION"];

/** Toutes les phases ouvertes — l'état des compagnies déjà en billetterie. */
export const MODULES_COMPLETS: CompanyModule[] = [...COMPANY_MODULES];

export function parseModules(raw: string | null | undefined): CompanyModule[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return COMPANY_MODULES.filter((module) => parsed.includes(module));
  } catch {
    // Une colonne illisible ne doit pas ouvrir de module par accident : le
    // socle phase 1 reste accessible, le reste attend une correction humaine.
    return [];
  }
}

export function serialiseModules(modules: CompanyModule[]): string {
  return JSON.stringify(COMPANY_MODULES.filter((module) => modules.includes(module)));
}
