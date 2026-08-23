import { createHmac, timingSafeEqual } from "node:crypto";
import { newId } from "@/lib/core/ids";
import type { PaymentProviderId } from "@/lib/domain/types";
import type {
  ChargeRequest,
  ChargeResult,
  ChargeStatus,
  PaymentProvider,
  PayoutRequest,
  PayoutResult,
} from "./provider";

/**
 * Opérateur simulé, utilisé tant qu'aucun contrat d'agrégateur n'est signé
 * (FlexPay, MaxiCash, Flutterwave — §3.2). Il reproduit fidèlement les
 * comportements que la recette doit couvrir plutôt que de toujours réussir :
 * un fournisseur qui répond toujours OUI ne teste rien.
 *
 * Le numéro du payeur pilote le scénario, ce qui rend les cas de §5.2
 * rejouables à la main pendant la formation :
 *   …0000 → échec     …9999 → aucune réponse (webhook jamais reçu)
 *   …7777 → confirmation différée (webhook après quelques secondes)
 *   autre → confirmation immédiate au polling
 */
export class SimulatedProvider implements PaymentProvider {
  private readonly charges = new Map<string, { status: ChargeStatus; at: number }>();

  constructor(
    readonly id: PaymentProviderId,
    readonly label: string,
    private readonly webhookSecret = process.env.MOBEMBO_WEBHOOK_SECRET ?? "mobembo-webhook-dev",
  ) {}

  private scenarioFor(phone: string): ChargeStatus {
    if (phone.endsWith("0000")) return "ECHOUE";
    if (phone.endsWith("9999")) return "INDETERMINE";
    return "CONFIRME";
  }

  async charge(request: ChargeRequest): Promise<ChargeResult> {
    const providerRef = `${this.id}-${newId("ref").slice(4)}`;
    const eventual = this.scenarioFor(request.payerPhone);
    this.charges.set(providerRef, { status: eventual, at: Date.now() });
    // L'initiation ne confirme jamais : c'est le webhook ou le polling qui
    // tranche. Confirmer ici masquerait le cas « webhook jamais reçu ».
    return { status: "INITIE", providerRef, raw: { accepted: true, scenario: eventual } };
  }

  async pollCharge(providerRef: string): Promise<ChargeResult> {
    const record = this.charges.get(providerRef);
    if (!record) return { status: "INDETERMINE", providerRef, raw: { unknown: true } };
    if (record.status === "INDETERMINE") {
      // L'opérateur ne sait pas non plus : c'est exactement le cas où §3.2
      // impose de laisser le siège verrouillé et de créer un ticket support.
      return { status: "INDETERMINE", providerRef, raw: { pending: true } };
    }
    const delayed = Date.now() - record.at < 1500 && record.status === "CONFIRME";
    return {
      status: delayed ? "INITIE" : record.status,
      providerRef,
      raw: { settled: !delayed },
    };
  }

  async payout(request: PayoutRequest): Promise<PayoutResult> {
    const providerRef = `${this.id}-out-${newId("ref").slice(4)}`;
    if (request.targetPhone.endsWith("0000")) {
      return { status: "ECHOUE", providerRef, raw: { reason: "wallet inconnu" } };
    }
    return { status: "ENVOYE", providerRef, raw: { accepted: true } };
  }

  verifyWebhook(rawBody: string, headers: Headers): boolean {
    const received = headers.get("x-mobembo-signature");
    if (!received) return false;
    const expected = createHmac("sha256", this.webhookSecret).update(rawBody).digest("hex");
    if (expected.length !== received.length) return false;
    return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
  }

  async statement(): Promise<
    Array<{ providerRef: string; amount: number; currency: "USD" | "CDF"; status: ChargeStatus }>
  > {
    // Le relevé du simulateur est vide : la réconciliation (§3.2) compare
    // alors les transactions internes à un relevé absent et signale l'écart,
    // ce qui est le comportement attendu tant qu'aucun opérateur n'est branché.
    return [];
  }
}

export function signWebhook(rawBody: string, secret = process.env.MOBEMBO_WEBHOOK_SECRET ?? "mobembo-webhook-dev"): string {
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}
