import { authed, body } from "@/lib/api/handler";
import { getDb } from "@/lib/db";
import { nowIso } from "@/lib/core/time";

/** GET — §2.11 alertes automatiques ouvertes. */
export const GET = authed(
  ["ADMIN_COMPAGNIE", "GERANT_AGENCE", "SUPER_ADMIN"],
  async ({ session }) => {
    const agenceClause = session.activeRole === "GERANT_AGENCE"
      ? "AND (agency_id IS NULL OR agency_id = ?)"
      : "";
    const values = session.activeRole === "GERANT_AGENCE"
      ? [session.companyId, session.agencyId]
      : [session.companyId];
    const rows = await getDb()
      .prepare(
        `SELECT * FROM alerts
          WHERE (company_id = ? OR company_id IS NULL) ${agenceClause}
            AND acknowledged_at IS NULL
          ORDER BY created_at DESC LIMIT 100`,
      )
      .all(...values);
    const support = session.activeRole === "SUPER_ADMIN"
      ? await getDb().prepare(`SELECT * FROM support_tickets WHERE status = 'OUVERT' ORDER BY created_at DESC`).all()
      : await getDb()
          .prepare(
            `SELECT s.* FROM support_tickets s
              JOIN payments p ON p.id = s.reference
              JOIN bookings b ON b.id = p.booking_id
              JOIN trips t ON t.id = b.trip_id
             WHERE s.status = 'OUVERT' AND t.company_id = ?
             ORDER BY s.created_at DESC`,
          )
          .all(session.companyId);
    return { alertes: rows, ticketsSupport: support };
  },
);

/** POST — prise en compte d'une alerte par le gérant. */
export const POST = authed(
  ["ADMIN_COMPAGNIE", "GERANT_AGENCE", "SUPER_ADMIN"],
  async ({ request, session }) => {
    const { alerteId } = await body<{ alerteId: string }>(request);
    const alerte = await getDb()
      .prepare<{ company_id: string | null; agency_id: string | null }>(
        `SELECT company_id, agency_id FROM alerts WHERE id = ?`,
      )
      .get(alerteId);
    if (!alerte) return { acquittee: false };
    if (session.activeRole !== "SUPER_ADMIN" && alerte.company_id !== session.companyId) {
      return { acquittee: false };
    }
    if (
      session.activeRole === "GERANT_AGENCE" &&
      alerte.agency_id !== null &&
      alerte.agency_id !== session.agencyId
    ) {
      return { acquittee: false };
    }
    await getDb().prepare(`UPDATE alerts SET acknowledged_at = ? WHERE id = ?`).run(nowIso(), alerteId);
    return { acquittee: true };
  },
);
