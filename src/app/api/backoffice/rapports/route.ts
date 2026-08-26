import { authed } from "@/lib/api/handler";
import { getDb } from "@/lib/db";
import { revenueReport } from "@/lib/domain/settlements";
import { companyScope } from "@/lib/auth/session";

/**
 * GET /api/backoffice/rapports — §2.11 « Rapports et alertes du back-office ».
 * Recettes par agence / guichetier / canal / opérateur, écarts de caisse,
 * remplissage, no-show, revente.
 */
export const GET = authed(
  ["ADMIN_COMPAGNIE", "SUPER_ADMIN"],
  async ({ request, session }) => {
    const params = request.nextUrl.searchParams;
    const companyId = companyScope(session, params.get("compagnie"));

    const from = params.get("du") ?? new Date(Date.now() - 30 * 86_400_000).toISOString();
    const to = params.get("au") ?? new Date(Date.now() + 86_400_000).toISOString();
    const db = getDb();
    // Fenêtre "remboursements en retard" (SLA 48h) : calculée côté JS et liée
    // en paramètre — datetime('now', …) est une fonction SQLite absente de MySQL.
    const ilYA48h = new Date(Date.now() - 48 * 3_600_000).toISOString();

    const recettes = await revenueReport({ companyId, from, to, db });

    const ecartsCaisse = await db
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

    const remplissage = await db
      .prepare(
        `SELECT t.id AS tripId, CONCAT(r.origin_city, ' → ', r.destination_city) AS axe,
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

    const resaleRows = await db
      .prepare<{ sold_at: string | null; listed_at: string; status: string; fee_amount: number | null }>(
        `SELECT sold_at, listed_at, status, fee_amount FROM resale_listings
          WHERE trip_id IN (SELECT id FROM trips WHERE company_id = ?)
            AND listed_at >= ? AND listed_at < ?`,
      )
      .all(companyId, from, to);
    // julianday() est spécifique à SQLite : le délai moyen de revente
    // (en heures) est calculé côté JS à partir des horodatages ISO 8601.
    const delais = resaleRows
      .filter((r) => r.sold_at)
      .map((r) => (new Date(r.sold_at as string).getTime() - new Date(r.listed_at).getTime()) / 3_600_000);
    const revente = {
      annonces: resaleRows.length,
      vendues: resaleRows.filter((r) => r.status === "VENDUE").length,
      commissions: resaleRows.reduce((somme, r) => somme + (r.fee_amount ?? 0), 0),
      delaiMoyenH: delais.length > 0 ? delais.reduce((a, b) => a + b, 0) / delais.length : null,
    };

    // §5.1 Indicateurs de réussite — le tableau que la direction regarde.
    const indicateurs = await db
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
               AND r.created_at <= ?) AS remboursementsHorsSla,
           (SELECT COUNT(*) FROM sync_log WHERE kind = 'VENTE_POS' AND result = 'APPLIQUE') AS ventesHorsLigneSynchronisees`,
      )
      .get(companyId, companyId, companyId, companyId, ilYA48h);

    return { periode: { du: from, au: to }, recettes, ecartsCaisse, remplissage, revente, indicateurs };
  },
);
