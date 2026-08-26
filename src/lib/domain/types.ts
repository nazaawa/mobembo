import type { Currency } from "@/lib/core/money";

export type Role =
  | "SUPER_ADMIN"
  | "ADMIN_COMPAGNIE"
  | "GERANT_AGENCE"
  | "GUICHETIER"
  | "CONTROLEUR"
  | "PASSAGER";

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: "Super administrateur",
  ADMIN_COMPAGNIE: "Direction de la compagnie",
  GERANT_AGENCE: "Gérant d'agence",
  GUICHETIER: "Guichetier",
  CONTROLEUR: "Contrôleur",
  PASSAGER: "Passager",
};

/** §2.3 Canaux de vente. Un siège appartient à un canal et à un seul. */
export type Channel = "GUICHET" | "EN_LIGNE" | "RESERVE_COMPAGNIE";
export const CHANNELS: Channel[] = ["GUICHET", "EN_LIGNE", "RESERVE_COMPAGNIE"];

export const CHANNEL_LABELS: Record<Channel, string> = {
  GUICHET: "Guichet",
  EN_LIGNE: "En ligne",
  RESERVE_COMPAGNIE: "Réservé compagnie",
};

/** §2.8 Machine à états du siège. */
export type SeatStatus =
  | "DISPONIBLE"
  | "VERROUILLE"
  | "VENDU"
  | "EMBARQUE"
  | "ANNULE"
  | "BLOQUE_ADMIN";

/** §2.8 Machine à états du billet. */
export type TicketStatus =
  | "EMIS"
  | "EN_REVENTE"
  | "ANNULE_REVENDU"
  | "TRANSFERE"
  | "EMBARQUE"
  | "ANNULE"
  | "EXPIRE";

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  EMIS: "Émis",
  EN_REVENTE: "En revente",
  ANNULE_REVENDU: "Annulé — revendu",
  TRANSFERE: "Transféré",
  EMBARQUE: "Embarqué",
  ANNULE: "Annulé",
  EXPIRE: "Expiré (no-show)",
};

export type DepartureMode = "HORAIRE_FIXE" | "DEPART_A_REMPLISSAGE";
export type TripStatus = "PLANIFIE" | "EN_VENTE" | "PARTI" | "CLOTURE" | "ANNULE";
export type BusCategory = "VIP" | "STANDARD";

/** Type de véhicule — orthogonal à BusCategory, qui reste le confort (VIP/STANDARD). */
export type VehicleType = "BUS" | "VOITURE";
export const VEHICLE_TYPE_LABELS: Record<VehicleType, string> = {
  BUS: "Bus",
  VOITURE: "Voiture express",
};

export type PartnerApplicationType = "COMPAGNIE" | "INDEPENDANT";

export type PaymentProviderId =
  | "MPESA"
  | "ORANGE_MONEY"
  | "AIRTEL_MONEY"
  | "ESPECES"
  | "AVOIR";

export const MOBILE_MONEY_PROVIDERS: PaymentProviderId[] = [
  "MPESA",
  "ORANGE_MONEY",
  "AIRTEL_MONEY",
];

export const PROVIDER_LABELS: Record<PaymentProviderId, string> = {
  MPESA: "M-Pesa (Vodacom)",
  ORANGE_MONEY: "Orange Money",
  AIRTEL_MONEY: "Airtel Money",
  ESPECES: "Espèces (guichet)",
  AVOIR: "Avoir",
};

export type PaymentStatus =
  | "INITIE"
  | "CONFIRME"
  | "ECHOUE"
  | "INDETERMINE"
  | "REMBOURSE";

/**
 * §2.9 : « Grille paramétrable. Les avoirs et remboursements sortent de la
 * poche de la compagnie : chaque seuil est configurable par compagnie, avec la
 * grille ci-dessous pré-remplie. »
 */
export interface CompanyPolicy {
  /** Transfert à un proche — gratuit, jusqu'à N heures avant le départ. */
  transferDeadlineHours: number;
  /** Revente — jusqu'à N heures avant le départ. */
  resaleDeadlineHours: number;
  /** Commission de revente et son plancher (§2.6). */
  resaleFeeRate: number;
  resaleFeeFloorUsd: number;
  /** Garde-fou anti-revendeur professionnel : N reventes / téléphone / mois. */
  resaleMaxPerPhonePerMonth: number;
  /** Report de date — jusqu'à N heures avant, 100 % en avoir de X jours. */
  postponeDeadlineHours: number;
  postponeCreditDays: number;
  /** Annulation tardive : de N heures avant jusqu'au départ, X % en avoir. */
  lateCancelRate: number;
  lateCancelCreditDays: number;
  /** Verrou de siège (§2.5). */
  seatLockMinutes: number;
  seatLockPaymentExtensionMinutes: number;
  maxLocksPerPhone: number;
  /** Seuil d'écart de caisse déclenchant une alerte (§2.11), en centimes USD. */
  cashVarianceAlertThreshold: number;
  /** Réserve de garantie roulante (§2.10). */
  guaranteeHoldRate: number;
}

export const DEFAULT_POLICY: CompanyPolicy = {
  transferDeadlineHours: 1,
  resaleDeadlineHours: 4,
  resaleFeeRate: 0.1,
  resaleFeeFloorUsd: 100, // 1 USD en centimes
  resaleMaxPerPhonePerMonth: 3,
  postponeDeadlineHours: 4,
  postponeCreditDays: 60,
  lateCancelRate: 0.5,
  lateCancelCreditDays: 30,
  seatLockMinutes: 7,
  seatLockPaymentExtensionMinutes: 15,
  maxLocksPerPhone: 3,
  cashVarianceAlertThreshold: 500, // 5 USD
  guaranteeHoldRate: 0.05,
};

export interface SeatMapLayout {
  /** Colonnes de gauche à droite ; "aisle" matérialise le couloir (§2.1). */
  columns: string[];
}

export interface Money {
  amount: number;
  currency: Currency;
}
