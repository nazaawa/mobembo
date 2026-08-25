import { authed, body } from "@/lib/api/handler";
import { getDb } from "@/lib/db";
import { nowIso } from "@/lib/core/time";

/** GET — §2.11 alertes automatiques ouvertes. */
export const GET = authed(
  ["ADMIN_COMPAGNIE", "GERANT_AGENCE", "SUPER_ADMIN"],
  async ({ session }) => {
    const rows = await getDb()
      .prepare(
        `SELECT * FROM alerts
          WHERE (company_id = ? OR company_id IS NULL) AND acknowledged_at IS NULL
          ORDER BY created_at DESC LIMIT 100`,
      )
      .all(session.companyId);
    const support = await getDb()
      .prepare(`SELECT * FROM support_tickets WHERE status = 'OUVERT' ORDER BY created_at DESC`)
      .all();
    return { alertes: rows, ticketsSupport: support };
  },
);

/** POST — prise en compte d'une alerte par le gérant. */
export const POST = authed(
  ["ADMIN_COMPAGNIE", "GERANT_AGENCE", "SUPER_ADMIN"],
  async ({ request }) => {
    const { alerteId } = await body<{ alerteId: string }>(request);
    await getDb().prepare(`UPDATE alerts SET acknowledged_at = ? WHERE id = ?`).run(nowIso(), alerteId);
    return { acquittee: true };
  },
);
