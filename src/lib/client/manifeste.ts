"use client";

/**
 * Cache local du manifeste et des scans du terminal contrôleur (§2.7).
 * « Le contrôleur télécharge le manifeste du voyage avant le départ, à la gare,
 * avec réseau. »
 */
import { notifierChangement } from "./store";

const PREFIX = "mobembo.controle";

export interface EntreeManifeste {
  ticketId: string;
  ticketCode: string;
  seat: string;
  passengerName: string;
  passengerPhone: string;
  status: string;
  invalide: boolean;
  motifInvalidite?: string;
  nouveauTitulaire?: string;
  dejaScanneA?: string | null;
}

export interface ManifesteLocal {
  tripId: string;
  compagnie: string;
  ligne: string;
  depart: string;
  plaque: string;
  cleVerification: string;
  genereA: string;
  entries: EntreeManifeste[];
  totalValides: number;
}

export interface ScanLocal {
  clientOpId: string;
  tripId: string;
  ticketId: string | null;
  rawQr: string;
  clientTime: string;
  resultat: "ACCEPTE" | "DEJA_SCANNE" | "REFUSE";
  motif?: string;
  synchronise: boolean;
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
    /* stockage indisponible : le terminal repasse en mode connecté */
  }
  notifierChangement();
}

export function terminalId(): string {
  const existant = lire<string | null>("terminal", null);
  if (existant) return existant;
  const identifiant = `ctrl-${Math.random().toString(36).slice(2, 10)}`;
  ecrire("terminal", identifiant);
  return identifiant;
}

export function manifestesLocaux(): ManifesteLocal[] {
  return Object.values(lire<Record<string, ManifesteLocal>>("manifestes", {}));
}

export function lireManifeste(tripId: string): ManifesteLocal | null {
  return lire<Record<string, ManifesteLocal>>("manifestes", {})[tripId] ?? null;
}

export function ecrireManifeste(manifeste: ManifesteLocal): void {
  const tous = lire<Record<string, ManifesteLocal>>("manifestes", {});
  tous[manifeste.tripId] = manifeste;
  ecrire("manifestes", tous);
}

export function scansLocaux(tripId?: string): ScanLocal[] {
  const tous = lire<ScanLocal[]>("scans", []);
  return tripId ? tous.filter((scan) => scan.tripId === tripId) : tous;
}

export function enregistrerScan(scan: ScanLocal): void {
  ecrire("scans", [...lire<ScanLocal[]>("scans", []), scan]);
}

export function marquerScansSynchronises(clientOpIds: string[]): void {
  const faits = new Set(clientOpIds);
  ecrire(
    "scans",
    lire<ScanLocal[]>("scans", []).map((scan) =>
      faits.has(scan.clientOpId) ? { ...scan, synchronise: true } : scan,
    ),
  );
}

/**
 * §2.7 anti-rejeu : « Le premier scan marque le billet localement. » Le
 * terminal n'a pas besoin du réseau pour refuser un second passage.
 */
export function premierScanLocal(tripId: string, ticketId: string): ScanLocal | undefined {
  return scansLocaux(tripId).find(
    (scan) => scan.ticketId === ticketId && scan.resultat === "ACCEPTE",
  );
}

export function nouvelOpId(): string {
  return `${terminalId()}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}
