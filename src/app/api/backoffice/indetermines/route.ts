import { authed } from "@/lib/api/handler";
import { getDb } from "@/lib/db";

/**
 * GET — file des paiements en statut INDETERMINE en attente d'arbitrage humain
 * (§3.2). L'indicateur cible de §5.1 est « < 1 % des initiations ».
 */
export const GET = authed(["ADMIN_COMPAGNIE", "SUPER_ADMIN"], async ({ session }) => {
  const db = getDb();
  const paiements = db
    .prepare(
      `SELECT p.*, b.trip_id, b.buyer_name, b.buyer_phone, s.body AS ticketSupport
         FROM payments p
         JOIN bookings b ON b.id = p.booking_id
         LEFT JOIN support_tickets s ON s.reference = p.id
        WHERE p.status = 'INDETERMINE'
          AND (? IS NULL OR b.trip_id IN (SELECT id FROM trips WHERE company_id = ?))
        ORDER BY p.created_at`,
    )
    .all(session.companyId, session.companyId);

  const taux = db
    .prepare(
      `SELECT
         COUNT(*) AS initiations,
         SUM(CASE WHEN status = 'INDETERMINE' THEN 1 ELSE 0 END) AS indetermines
       FROM payments WHERE provider <> 'ESPECES'`,
    )
    .get() as { initiations: number; indetermines: number };

  return {
    paiements,
    indicateur: {
      ...taux,
      taux: taux.initiations > 0 ? taux.indetermines / taux.initiations : 0,
      cible: 0.01,
    },
  };
});
