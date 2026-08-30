import { NextResponse, type NextRequest } from "next/server";
import { settleByReference } from "@/lib/domain/webhook-settlement";
import { getProvider } from "@/lib/payments/registry";
import type { PaymentProviderId } from "@/lib/domain/types";

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

  const result = await settleByReference(event.reference, event.statut, event);
  // Un webhook pour un paiement inconnu reçoit 200 : l'opérateur ne doit pas
  // le rejouer indéfiniment, et l'écart sortira à la réconciliation (§3.2).
  if (!result.trouve) {
    return NextResponse.json({ recu: true, applique: false, motif: "paiement inconnu" });
  }

  return NextResponse.json({
    recu: true,
    applique: true,
    statut: result.statut,
    billetsEmis: result.billetsEmis,
  });
}
