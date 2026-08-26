import { authed } from "@/lib/api/handler";
import { getDb } from "@/lib/db";

/**
 * GET /api/backoffice/audit — §2.11 « Journal d'audit filtrable et
 * exportable. » Le journal est en écriture seule : cette route ne fait que lire.
 */
export const GET = authed(
  ["ADMIN_COMPAGNIE", "SUPER_ADMIN"],
  async ({ request, session }) => {
    const params = request.nextUrl.searchParams;
    const companyId = session.activeRole === "SUPER_ADMIN"
      ? params.get("compagnie")
      : session.companyId;
    const action = params.get("action");
    const userId = params.get("utilisateur");
    const limit = Math.min(Number(params.get("limite") ?? 200), 1000);
    const format = params.get("format");

    const conditions: string[] = [];
    const values: unknown[] = [];
    if (companyId) {
      conditions.push("(a.company_id = ? OR a.company_id IS NULL)");
      values.push(companyId);
    }
    if (action) {
      conditions.push("a.action = ?");
      values.push(action);
    }
    if (userId) {
      conditions.push("a.user_id = ?");
      values.push(userId);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const entries = (await getDb()
      .prepare(
        `SELECT a.*, u.name AS utilisateur FROM audit_log a
         LEFT JOIN users u ON u.id = a.user_id
         ${where} ORDER BY a.created_at DESC LIMIT ?`,
      )
      .all(...values, limit)) as Array<Record<string, unknown>>;

    if (format === "csv") {
      const columns = [
        "created_at",
        "utilisateur",
        "role",
        "action",
        "entity",
        "entity_id",
        "before_json",
        "after_json",
        "ip",
        "device",
      ];
      const escape = (value: unknown) =>
        `"${String(value ?? "").replace(/"/g, '""').replace(/\n/g, " ")}"`;
      const csv = [
        columns.join(";"),
        ...entries.map((row) => columns.map((c) => escape(row[c])).join(";")),
      ].join("\n");
      return new Response(csv, {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="audit-mobembo.csv"`,
        },
      }) as never;
    }

    return { entrees: entries };
  },
);
