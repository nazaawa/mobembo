import type { DbHandle } from "@/lib/db";
import { getDb } from "@/lib/db";
import { settlePayment } from "@/lib/domain/payments";
import { settleReservationPayment } from "@/lib/domain/reservation-payments";
import type { PaymentRow } from "@/lib/domain/repo";

/**
 * Un webhook, deux billetteries.
 *
 * Une référence d'opérateur peut désigner une vente de sièges (`payments`) ou
 * le paiement d'une réservation de phase 3 (`schedule_payments`). Les deux
 * routes de webhook passent par ici plutôt que de dupliquer la recherche —
 * et surtout pour qu'aucune des deux ne réponde « paiement inconnu » à un
 * paiement qui existe simplement dans l'autre table.
 */
export interface WebhookOutcome {
  trouve: boolean;
  statut?: string;
  billetsEmis?: number;
}

export async function settleByReference(
  reference: string,
  statut: "CONFIRME" | "ECHOUE",
  event: unknown,
  db: DbHandle = getDb(),
): Promise<WebhookOutcome> {
  const vente = await db
    .prepare<PaymentRow>(`SELECT * FROM payments WHERE provider_ref = ? OR idempotency_key = ?`)
    .get(reference, reference);
  if (vente) {
    // settlePayment est idempotent : un webhook rejoué n'émet pas de second billet.
    const result = await settlePayment(vente.id, statut, event);
    return { trouve: true, statut: result.payment.status, billetsEmis: result.tickets.length };
  }

  const reservation = await db
    .prepare<{ id: string }>(
      `SELECT id FROM schedule_payments WHERE provider_ref = ? OR idempotency_key = ?`,
    )
    .get(reference, reference);
  if (reservation) {
    const result = await settleReservationPayment(reservation.id, statut, event);
    return {
      trouve: true,
      statut: result.payment.status,
      billetsEmis: result.ticket ? 1 : 0,
    };
  }

  return { trouve: false };
}
