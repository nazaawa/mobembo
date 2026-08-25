import type { DbHandle } from "@/lib/db";
import { getDb } from "@/lib/db";
import { newId } from "@/lib/core/ids";
import { nowIso } from "@/lib/core/time";

/**
 * §3.3 : « Journal d'audit sur toute action sensible, conservation 24 mois, en
 * écriture seule. » Aucune fonction de mise à jour ni de suppression n'est
 * exposée ici — c'est volontaire.
 */
export interface AuditEntry {
  userId?: string | null;
  role?: string | null;
  companyId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  device?: string | null;
}

export async function audit(entry: AuditEntry, db: DbHandle = getDb()): Promise<void> {
  await db
    .prepare(
      `INSERT INTO audit_log
         (id, user_id, role, company_id, action, entity, entity_id,
          before_json, after_json, ip, device, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      newId("aud"),
      entry.userId ?? null,
      entry.role ?? null,
      entry.companyId ?? null,
      entry.action,
      entry.entity,
      entry.entityId ?? null,
      entry.before === undefined ? null : JSON.stringify(entry.before),
      entry.after === undefined ? null : JSON.stringify(entry.after),
      entry.ip ?? null,
      entry.device ?? null,
      nowIso(),
    );
}

/** §2.11 Alertes automatiques du back-office. */
export async function raiseAlert(
  alert: {
    kind: "TROU_SEQUENCE" | "ECART_CAISSE" | "ANNULATIONS_ANORMALES" | "PAIEMENT_INDETERMINE";
    body: string;
    companyId?: string | null;
    agencyId?: string | null;
    reference?: string | null;
    severity?: "BLOQUANTE" | "MAJEURE" | "MINEURE";
  },
  db: DbHandle = getDb(),
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO alerts (id, company_id, agency_id, kind, severity, body, reference, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      newId("alr"),
      alert.companyId ?? null,
      alert.agencyId ?? null,
      alert.kind,
      alert.severity ?? "MAJEURE",
      alert.body,
      alert.reference ?? null,
      nowIso(),
    );
}
