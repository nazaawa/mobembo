import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { settlePayment } from "@/lib/domain/payments";
import { getProvider } from "@/lib/payments/registry";
import type { PaymentProviderId } from "@/lib/domain/types";
import type { PaymentRow } from "@/lib/domain/repo";

/**
 * POST /api/webhooks/paiements — §3.2 « Webhook comme mécanisme principal de
 * confirmation. »
 *
 * La signature est vérifiée avant toute lecture métier : un webhook non signé
 * pourrait sinon faire émettre des billets gratuitement. Le corps brut est lu
 * tel quel, car la signature porte sur les octets, pas sur le JSON reparsé.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const raw = await request.text();

  let event: {
    operateur: PaymentProviderId;
    reference: string;
    statut: "CONFIRME" | "ECHOUE";
    [key: string]: unknown;
  };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ erreur: "CORPS_ILLISIBLE" }, { status: 400 });
  }

  let provider;
  try {
    provider = getProvider(event.operateur);
  } catch {
    return NextResponse.json({ erreur: "OPERATEUR_INCONNU" }, { status: 400 });
  }

  if (!provider.verifyWebhook(raw, request.headers)) {
    return NextResponse.json({ erreur: "SIGNATURE_INVALIDE" }, { status: 401 });
  }

  const payment = getDb()
    .prepare(`SELECT * FROM payments WHERE provider_ref = ? OR idempotency_key = ?`)
    .get(event.reference, event.reference) as PaymentRow | undefined;
  // Un webhook pour un paiement inconnu reçoit 200 : l'opérateur ne doit pas
  // le rejouer indéfiniment, et l'écart sortira à la réconciliation (§3.2).
  if (!payment) {
    return NextResponse.json({ recu: true, applique: false, motif: "paiement inconnu" });
  }

  // settlePayment est idempotent : un webhook rejoué n'émet pas de second billet.
  const result = await settlePayment(payment.id, event.statut, event);
  return NextResponse.json({
    recu: true,
    applique: true,
    statut: result.payment.status,
    billetsEmis: result.tickets.length,
  });
}
