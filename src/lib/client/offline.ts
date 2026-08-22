"use client";

/**
 * §2.4 Mode dégradé (hors-ligne) du POS.
 *
 * « Le POS conserve en local le quota guichet du jour et les ventes réalisées.
 *   Il vend hors-ligne strictement dans la limite de ce quota pré-alloué.
 *   Synchronisation automatique au retour du réseau, résolution de conflit par
 *   horodatage serveur.
 *   Un compteur permanent affiche "X sièges restants sur votre quota local". »
 *
 * Le stockage local est du cache de travail, jamais une source de vérité : au
 * retour du réseau, le serveur arbitre et peut refuser une vente. C'est
 * précisément pourquoi la vente hors-ligne est bornée au quota pré-alloué —
 * un refus doit rester impossible en pratique.
 */

import { notifierChangement } from "./store";

const PREFIX = "mobembo.pos";

export interface QuotaLocal {
  tripId: string;
  /** Sièges du quota GUICHET connus disponibles au dernier contact serveur. */
  siegesDisponibles: string[];
  /** Sièges consommés hors-ligne, en attente de synchronisation. */
  siegesConsommes: string[];
  telechargeA: string;
  trajet: {
    ligne: string;
    depart: string;
    plaque: string;
    categorie: string;
    prixUsd: number;
    prixCdf: number;
    rangees: number;
    colonnes: string[];
    siegesParCanal: Array<{ numero: string; canal: string; statut: string }>;
  };
}

export interface VenteEnFile {
  clientOpId: string;
  clientTime: string;
  tripId: string;
  sieges: string[];
  passagers: Array<{ seatNumber: string; name: string; phone?: string }>;
  telephone: string;
  nom: string;
  caisseId: string;
  devise: "USD" | "CDF";
  montant: number;
  /** Rempli après un refus serveur : la vente reste visible pour le gérant. */
  refus?: { code: string; message: string };
}

function lire<T>(cle: string, defaut: T): T {
  if (typeof window === "undefined") return defaut;
  try {
    const brut = window.localStorage.getItem(`${PREFIX}.${cle}`);
    return brut ? (JSON.parse(brut) as T) : defaut;
  } catch {
    return defaut;
  }
}

function ecrire(cle: string, valeur: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${PREFIX}.${cle}`, JSON.stringify(valeur));
  } catch {
    // Stockage plein ou refusé : le POS repasse simplement en mode connecté.
  }
  notifierChangement();
}

export function deviceId(): string {
  const existant = lire<string | null>("device", null);
  if (existant) return existant;
  const identifiant = `pos-${Math.random().toString(36).slice(2, 10)}`;
  ecrire("device", identifiant);
  return identifiant;
}

export function lireQuota(tripId: string): QuotaLocal | null {
  const quotas = lire<Record<string, QuotaLocal>>("quotas", {});
  return quotas[tripId] ?? null;
}

export function ecrireQuota(quota: QuotaLocal): void {
  const quotas = lire<Record<string, QuotaLocal>>("quotas", {});
  quotas[quota.tripId] = quota;
  ecrire("quotas", quotas);
}

export function quotasTelecharges(): QuotaLocal[] {
  return Object.values(lire<Record<string, QuotaLocal>>("quotas", {}));
}

/** Sièges encore vendables hors-ligne sur ce trajet. */
export function restantLocal(quota: QuotaLocal): string[] {
  const consommes = new Set(quota.siegesConsommes);
  return quota.siegesDisponibles.filter((seat) => !consommes.has(seat));
}

export function consommerLocal(tripId: string, sieges: string[]): void {
  const quota = lireQuota(tripId);
  if (!quota) return;
  quota.siegesConsommes = [...new Set([...quota.siegesConsommes, ...sieges])];
  ecrireQuota(quota);
}

export function file(): VenteEnFile[] {
  return lire<VenteEnFile[]>("file", []);
}

export function empiler(vente: VenteEnFile): void {
  ecrire("file", [...file(), vente]);
}

export function retirer(clientOpIds: string[]): void {
  const aRetirer = new Set(clientOpIds);
  ecrire(
    "file",
    file().filter((vente) => !aRetirer.has(vente.clientOpId)),
  );
}

export function marquerRefus(
  clientOpId: string,
  refus: { code: string; message: string },
): void {
  ecrire(
    "file",
    file().map((vente) => (vente.clientOpId === clientOpId ? { ...vente, refus } : vente)),
  );
}

/**
 * Horodatage de la dernière synchronisation réussie. Conservé dans le magasin
 * local plutôt qu'en état React : il survit à la navigation, et le guichetier
 * qui revient sur l'écran voit depuis combien de temps sa file n'a pas été
 * vidée.
 */
export function derniereSynchro(): string | null {
  return lire<string | null>("derniereSynchro", null);
}

export function marquerSynchro(horodatage: string): void {
  ecrire("derniereSynchro", horodatage);
}

export function nouvelOpId(): string {
  return `${deviceId()}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}

/** Billets émis hors-ligne, conservés pour réimpression avant synchronisation. */
export interface BilletLocal {
  clientOpId: string;
  code: string;
  siege: string;
  passager: string;
  emisA: string;
  synchronise: boolean;
}

export function billetsLocaux(): BilletLocal[] {
  return lire<BilletLocal[]>("billets", []);
}

export function ajouterBilletLocal(billet: BilletLocal): void {
  ecrire("billets", [...billetsLocaux(), billet].slice(-200));
}

export function marquerSynchronise(clientOpId: string, code?: string): void {
  ecrire(
    "billets",
    billetsLocaux().map((billet) =>
      billet.clientOpId === clientOpId
        ? { ...billet, synchronise: true, code: code ?? billet.code }
        : billet,
    ),
  );
}
