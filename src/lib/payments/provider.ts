import type { Currency } from "@/lib/core/money";
import type { PaymentProviderId } from "@/lib/domain/types";

/**
 * §3.1 : « Couche d'abstraction PaymentProvider pour changer d'agrégateur sans
 * réécrire la logique métier. Les conditions commerciales des agrégateurs
 * changent, et la négociation est meilleure avec deux intégrations qu'avec
 * une. »
 *
 * Aucune méthode ne reçoit ni ne renvoie de PIN : §3.3 interdit qu'il transite
 * par la plateforme. Le PIN est saisi sur le téléphone du passager, dans le
 * canal USSD de l'opérateur.
 */
export interface ChargeRequest {
  idempotencyKey: string;
  payerPhone: string;
  amount: number;
  currency: Currency;
  reference: string;
  description: string;
}

export type ChargeStatus = "INITIE" | "CONFIRME" | "ECHOUE" | "INDETERMINE";

export interface ChargeResult {
  status: ChargeStatus;
  providerRef: string;
  raw: unknown;
}

export interface PayoutRequest {
  idempotencyKey: string;
  targetPhone: string;
  amount: number;
  currency: Currency;
  reference: string;
}

export interface PayoutResult {
  status: "ENVOYE" | "CONFIRME" | "ECHOUE";
  providerRef: string;
  raw: unknown;
}

export interface PaymentProvider {
  readonly id: PaymentProviderId;
  readonly label: string;
  /** Initie un débit. Retourne immédiatement : la confirmation vient du webhook. */
  charge(request: ChargeRequest): Promise<ChargeResult>;
  /** §3.2 : polling de secours quand aucun webhook n'arrive. */
  pollCharge(providerRef: string): Promise<ChargeResult>;
  /** Décaissement vers le vendeur d'une revente (§2.6). */
  payout(request: PayoutRequest): Promise<PayoutResult>;
  /** Vérifie la signature d'un webhook entrant. */
  verifyWebhook(rawBody: string, headers: Headers): boolean;
  /** Relevé opérateur du jour pour la réconciliation (§3.2). */
  statement(day: string): Promise<Array<{ providerRef: string; amount: number; currency: Currency; status: ChargeStatus }>>;
}
