import { NextResponse, type NextRequest } from "next/server";
import { settleByReference } from "@/lib/domain/webhook-settlement";
import { IdoloPayProvider } from "@/lib/payments/idolopay";

/**
 * POST /api/webhooks/idolopay — confirmation réelle de la passerelle IdoloPay.
 *
 * Route distincte de /api/webhooks/paiements : celle-ci attend l'enveloppe
 * interne de Mobembo ({ operateur, reference, statut }), qu'aucun agrégateur
 * réel ne peut produire puisqu'il parle son propre format. IdoloPay envoie le
 * sien ({ reference, status: "COMPLETED"|"FAILED"|... }), traduit ici avant
 * d'appeler le même `settlePayment` idempotent que le reste de la plateforme
 * (§3.2) — un webhook rejoué n'émet donc jamais un second jeu de billets.
 *
 * Même garantie qu'ailleurs : la signature HMAC est vérifiée sur le corps
 * brut, avant toute lecture métier.
 */
const verificateur = new IdoloPayProvider("MPESA", "IdoloPay");

type EvenementIdoloPay = {
  event?: string;
  reference?: string;
  status?: string;
  [key: string]: unknown;
};

export async function POST(request: NextRequest): Promise<NextResponse> {
  const raw = await request.text();

  if (!verificateur.verifyWebhook(raw, request.headers)) {
    return NextResponse.json({ erreur: "SIGNATURE_INVALIDE" }, { status: 401 });
  }

  let event: EvenementIdoloPay;
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ erreur: "CORPS_ILLISIBLE" }, { status: 400 });
  }

  const reference = event.reference;
  if (!reference) {
    return NextResponse.json({ erreur: "REFERENCE_ABSENTE" }, { status: 400 });
  }

  const statut =
    event.status === "COMPLETED"
      ? "CONFIRME"
      : event.status === "FAILED" || event.status === "REFUNDED"
        ? "ECHOUE"
        : null;

  // Statut intermédiaire (ACCEPTED, ENQUEUED, PROCESSING...) : rien à trancher
  // ici, le polling ou un webhook suivant le fera.
  if (!statut) {
    return NextResponse.json({ recu: true, applique: false, motif: "statut intermédiaire" });
  }

  const result = await settleByReference(reference, statut, event);

  // Un webhook pour un paiement inconnu reçoit 200 : IdoloPay ne doit pas le
  // rejouer indéfiniment, et l'écart sortira à la réconciliation (§3.2).
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
