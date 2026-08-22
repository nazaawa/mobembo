import { authed } from "@/lib/api/handler";
import { getDb } from "@/lib/db";
import { revenueReport } from "@/lib/domain/settlements";
import { errors } from "@/lib/core/errors";

/**
 * GET /api/backoffice/rapports — §2.11 « Rapports et alertes du back-office ».
 * Recettes par agence / guichetier / canal / opérateur, écarts de caisse,
 * remplissage, no-show, revente.
 */
export const GET = authed(
  ["ADMIN_COMPAGNIE", "GERANT_AGENCE", "SUPER_ADMIN"],
  async ({ request, session }) => {
    const params = request.nextUrl.searchParams;
    const companyId = params.get("compagnie") ?? session.companyId;
    if (!companyId) throw errors.invalid("Compagnie non déterminée.");

    const from = params.get("du") ?? new Date(Date.now() - 30 * 86_400_000).toISOString();
    const to = params.get("au") ?? new Date(Date.now() + 86_400_000).toISOString();
    const db = getDb();

    const recettes = revenueReport({ companyId, from, to, db });

    const ecartsCaisse = db
      .prepare(
        `SELECT cs.id, u.name AS agent, a.name AS agence, cs.opened_at, cs.closed_at,
                cs.opening_float, cs.counted_amount, cs.variance, cs.currency
           FROM cash_sessions cs
           JOIN users u ON u.id = cs.user_id
           JOIN agencies a ON a.id = cs.agency_id
          WHERE a.company_id = ? AND cs.closed_at IS NOT NULL
            AND cs.closed_at >= ? AND cs.closed_at < ?
          ORDER BY ABS(cs.variance) DESC`,
      )
      .all(companyId, from, to);

    const remplissage = db
      .prepare(
        `SELECT t.id AS tripId, r.origin_city || ' → ' || r.destination_city AS axe,
                t.departure_datetime AS depart, t.status,
                (SELECT COUNT(*) FROM trip_seats s WHERE s.trip_id = t.id) AS sieges,
                (SELECT COUNT(*) FROM tickets k WHERE k.trip_id = t.id AND k.status = 'EMBARQUE') AS embarques,
                (SELECT COUNT(*) FROM tickets k WHERE k.trip_id = t.id AND k.status IN ('EMIS','EN_REVENTE','EMBARQUE','EXPIRE')) AS vendus,
                (SELECT COUNT(*) FROM tickets k WHERE k.trip_id = t.id AND k.status = 'EXPIRE') AS noShows
           FROM trips t JOIN routes r ON r.id = t.route_id
          WHERE t.company_id = ? AND t.departure_datetime >= ? AND t.departure_datetime < ?
          ORDER BY t.departure_datetime DESC LIMIT 100`,
      )
      .all(companyId, from, to);

    const revente = db
      .prepare(
        `SELECT COUNT(*) AS annonces,
                SUM(CASE WHEN status = 'VENDUE' THEN 1 ELSE 0 END) AS vendues,
                COALESCE(SUM(fee_amount), 0) AS commissions,
                AVG(CASE WHEN sold_at IS NOT NULL
                    THEN (julianday(sold_at) - julianday(listed_at)) * 24 END) AS delaiMoyenH
           FROM resale_listings
          WHERE trip_id IN (SELECT id FROM trips WHERE company_id = ?)
            AND listed_at >= ? AND listed_at < ?`,
      )
      .get(companyId, from, to);

    // §5.1 Indicateurs de réussite — le tableau que la direction regarde.
    const indicateurs = db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM alerts WHERE company_id = ? AND kind = 'TROU_SEQUENCE') AS trousSequence,
           (SELECT COUNT(*) FROM payments p JOIN bookings b ON b.id = p.booking_id
             WHERE b.trip_id IN (SELECT id FROM trips WHERE company_id = ?)
               AND p.status = 'INDETERMINE') AS paiementsIndetermines,
           (SELECT COUNT(*) FROM payments p JOIN bookings b ON b.id = p.booking_id
             WHERE b.trip_id IN (SELECT id FROM trips WHERE company_id = ?)
               AND p.provider <> 'ESPECES') AS paiementsEnLigne,
           (SELECT COUNT(*) FROM refunds r JOIN tickets t ON t.id = r.ticket_id
             WHERE t.trip_id IN (SELECT id FROM trips WHERE company_id = ?)
               AND r.status = 'EN_FILE'
               AND r.created_at <= datetime('now','-48 hours')) AS remboursementsHorsSla,
           (SELECT COUNT(*) FROM sync_log WHERE kind = 'VENTE_POS' AND result = 'APPLIQUE') AS ventesHorsLigneSynchronisees`,
      )
      .get(companyId, companyId, companyId, companyId);

    return { periode: { du: from, au: to }, recettes, ecartsCaisse, remplissage, revente, indicateurs };
  },
);
