import { createHmac, timingSafeEqual } from "node:crypto";
import { fromMinor, toMinor, type Currency } from "@/lib/core/money";
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
 * Adaptateur IdoloPay (https://pay.idolotech.com), agrégateur réel de mobile
 * money. §3.1 : « Brancher un agrégateur réel se limite à remplacer une
 * entrée [du registre] : aucune autre partie du code ne connaît M-Pesa ou
 * Airtel. » C'est exactement ce que fait `registry.ts` quand IDOLOPAY_API_KEY
 * est renseignée et MOBEMBO_PAYMENT_MODE vaut "live".
 *
 * Contrat de l'API, d'après le guide d'intégration marchand IdoloPay :
 * - authentification par en-tête X-API-KEY ;
 * - POST /payments engage un encaissement mobile money : jamais de
 *   confirmation immédiate, l'issue arrive par webhook ou par
 *   GET /payments/{reference} — ce qui correspond exactement à l'opérateur
 *   simulé, qui ne confirme jamais à l'initiation non plus ;
 * - POST /wallets/payout envoie un décaissement (remboursement de revente) ;
 * - le webhook est signé HMAC SHA-256 dans X-IdoloPay-Signature
 *   ("sha256=...").
 *
 * §5.1 : les montants Mobembo circulent en centimes entiers. IdoloPay attend
 * un montant décimal dans l'unité naturelle de la devise (dollars, francs).
 * La conversion se fait aux deux frontières de cet adaptateur, jamais
 * ailleurs dans le domaine.
 */

const ENDPOINTS = {
  collecte: "/payments",
  verification: (reference: string) => `/payments/${encodeURIComponent(reference)}`,
  versement: "/wallets/payout",
  liste: "/payments",
};

function baseUrl(): string {
  return (process.env.IDOLOPAY_BASE_URL ?? "https://pay.idolotech.com").replace(/\/+$/, "");
}

function apiKey(): string {
  return process.env.IDOLOPAY_API_KEY ?? "";
}

/** Vrai quand la passerelle IdoloPay doit remplacer l'opérateur simulé. */
export function idoloPayLive(): boolean {
  return process.env.MOBEMBO_PAYMENT_MODE === "live" && !!apiKey();
}

type ReponseIdoloPay = {
  statusCode?: number;
  message?: string | string[];
  reference?: string;
  status?: string;
};

type ListeIdoloPay = {
  transactions?: Array<{
    reference: string;
    status: string;
    amount: number | string;
    currency: string;
    createdAt: string;
  }>;
};

async function appeler<T>(
  chemin: string,
  init: { method?: string; body?: unknown; query?: Record<string, string> } = {},
): Promise<T | null> {
  try {
    const url = new URL(`${baseUrl()}${chemin}`);
    for (const [cle, valeur] of Object.entries(init.query ?? {})) {
      url.searchParams.set(cle, valeur);
    }

    const response = await fetch(url, {
      method: init.method ?? "GET",
      headers: { "X-API-KEY": apiKey(), "Content-Type": "application/json" },
      body: init.body ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

/** Traduit le vocabulaire IdoloPay (COMPLETED/FAILED/…) vers celui du domaine. */
function statutVersChargeStatus(statut: string | undefined): ChargeStatus {
  if (statut === "COMPLETED") return "CONFIRME";
  if (statut === "FAILED" || statut === "REFUNDED") return "ECHOUE";
  return "INITIE"; // encore en cours : le polling ou le webhook tranchera
}

export class IdoloPayProvider implements PaymentProvider {
  constructor(
    readonly id: PaymentProviderId,
    readonly label: string,
  ) {}

  /** L'initiation ne confirme jamais : voir SimulatedProvider pour la même règle. */
  async charge(request: ChargeRequest): Promise<ChargeResult> {
    const payload = await appeler<ReponseIdoloPay>(ENDPOINTS.collecte, {
      method: "POST",
      body: {
        amount: fromMinor(request.amount),
        currency: request.currency,
        paymentMethod: "MOBILE_MONEY",
        // L'opérateur (M-Pesa, Orange, Airtel) est auto-détecté d'après le
        // numéro : le `id` choisi côté Mobembo ne pilote pas l'appel.
        customerPhone: request.payerPhone,
        metadata: {
          plateforme: "MOBEMBO",
          reservation: request.reference,
          idempotencyKey: request.idempotencyKey,
        },
      },
    });

    if (!payload || payload.statusCode || !payload.reference) {
      return {
        status: "ECHOUE",
        providerRef: "",
        raw: payload ?? { erreur: "IdoloPay injoignable" },
      };
    }

    return { status: "INITIE", providerRef: payload.reference, raw: payload };
  }

  async pollCharge(providerRef: string): Promise<ChargeResult> {
    const payload = await appeler<ReponseIdoloPay>(ENDPOINTS.verification(providerRef));

    if (!payload || !payload.status) {
      // Panne transitoire de la passerelle : on ne tranche pas nous-mêmes,
      // le prochain sondage ou la fenêtre de cinq minutes (§3.2) le fera.
      return { status: "INITIE", providerRef, raw: payload ?? { erreur: "IdoloPay injoignable" } };
    }

    return { status: statutVersChargeStatus(payload.status), providerRef, raw: payload };
  }

  /** Décaissement vers le vendeur d'une revente (§2.6) : mis en file, résolu plus tard. */
  async payout(request: PayoutRequest): Promise<PayoutResult> {
    const payload = await appeler<ReponseIdoloPay>(ENDPOINTS.versement, {
      method: "POST",
      body: {
        amount: fromMinor(request.amount),
        currency: request.currency,
        recipientPhone: request.targetPhone,
        senderName: "MOBEMBO",
        customerMessage: "Remboursement Mobembo",
      },
    });

    if (!payload || payload.statusCode || !payload.reference) {
      return {
        status: "ECHOUE",
        providerRef: "",
        raw: payload ?? { erreur: "IdoloPay injoignable" },
      };
    }

    return { status: "ENVOYE", providerRef: payload.reference, raw: payload };
  }

  /**
   * Signature HMAC SHA-256 du corps brut, envoyée dans X-IdoloPay-Signature
   * sous la forme "sha256=<empreinte>".
   */
  verifyWebhook(rawBody: string, headers: Headers): boolean {
    const secret = process.env.IDOLOPAY_WEBHOOK_SECRET;
    const entete = headers.get("x-idolopay-signature") ?? headers.get("x-signature");
    if (!secret || !entete) return false;

    const fournie = entete.replace(/^sha256=/i, "");
    const attendue = createHmac("sha256", secret).update(rawBody).digest("hex");
    const a = Buffer.from(attendue);
    const b = Buffer.from(fournie);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }

  /**
   * §3.2 réconciliation quotidienne. La fenêtre de pagination reste bornée
   * (5 pages, 500 lignes) faute de paramètre de date documenté sur l'API :
   * au-delà, un écart pourrait échapper au contrôle du jour et devrait être
   * traité par un relevé manuel.
   */
  async statement(
    day: string,
  ): Promise<Array<{ providerRef: string; amount: number; currency: Currency; status: ChargeStatus }>> {
    const lignes: Array<{ providerRef: string; amount: number; currency: Currency; status: ChargeStatus }> = [];
    const debut = new Date(`${day}T00:00:00.000Z`).getTime();
    const fin = new Date(`${day}T23:59:59.999Z`).getTime();

    for (let page = 1; page <= 5; page += 1) {
      const payload = await appeler<ListeIdoloPay>(ENDPOINTS.liste, {
        query: { page: String(page), limit: "100" },
      });
      const transactions = payload?.transactions ?? [];
      if (transactions.length === 0) break;

      for (const ligne of transactions) {
        const horodatage = new Date(ligne.createdAt).getTime();
        if (horodatage < debut || horodatage > fin) continue;
        if (ligne.status !== "COMPLETED" && ligne.status !== "FAILED") continue;
        lignes.push({
          providerRef: ligne.reference,
          amount: toMinor(Number(ligne.amount)),
          currency: ligne.currency as Currency,
          status: statutVersChargeStatus(ligne.status),
        });
      }

      if (transactions.length < 100) break;
    }

    return lignes;
  }
}
