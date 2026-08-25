import type { PaymentProviderId } from "@/lib/domain/types";
import { PROVIDER_LABELS } from "@/lib/domain/types";
import { IdoloPayProvider, idoloPayLive } from "./idolopay";
import type { PaymentProvider } from "./provider";
import { SimulatedProvider } from "./simulated";

/**
 * Registre des opérateurs. Brancher un agrégateur réel se limite à remplacer
 * une entrée : aucune autre partie du code ne connaît M-Pesa ou Airtel.
 *
 * Tant que MOBEMBO_PAYMENT_MODE n'est pas "live" ou qu'IDOLOPAY_API_KEY est
 * vide, l'opérateur simulé reste en place : la recette §5.2 (numéros se
 * terminant par 0000/9999/7777) continue de fonctionner sans clé.
 */
const registry = new Map<PaymentProviderId, PaymentProvider>(
  idoloPayLive()
    ? [
        ["MPESA", new IdoloPayProvider("MPESA", PROVIDER_LABELS.MPESA)],
        ["ORANGE_MONEY", new IdoloPayProvider("ORANGE_MONEY", PROVIDER_LABELS.ORANGE_MONEY)],
        ["AIRTEL_MONEY", new IdoloPayProvider("AIRTEL_MONEY", PROVIDER_LABELS.AIRTEL_MONEY)],
      ]
    : [
        ["MPESA", new SimulatedProvider("MPESA", PROVIDER_LABELS.MPESA)],
        ["ORANGE_MONEY", new SimulatedProvider("ORANGE_MONEY", PROVIDER_LABELS.ORANGE_MONEY)],
        ["AIRTEL_MONEY", new SimulatedProvider("AIRTEL_MONEY", PROVIDER_LABELS.AIRTEL_MONEY)],
      ],
);

export function registerProvider(provider: PaymentProvider): void {
  registry.set(provider.id, provider);
}

export function getProvider(id: PaymentProviderId): PaymentProvider {
  const provider = registry.get(id);
  if (!provider) throw new Error(`Opérateur de paiement non configuré : ${id}`);
  return provider;
}

export function listProviders(): PaymentProvider[] {
  return [...registry.values()];
}
