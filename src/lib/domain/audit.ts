import type { Database } from "better-sqlite3";
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

export function audit(entry: AuditEntry, db: Database = getDb()): void {
  db.prepare(
    `INSERT INTO audit_log
       (id, user_id, role, company_id, action, entity, entity_id,
        before_json, after_json, ip, device, created_at)
     VALUES (@id, @user_id, @role, @company_id, @action, @entity, @entity_id,
             @before_json, @after_json, @ip, @device, @created_at)`,
  ).run({
    id: newId("aud"),
    user_id: entry.userId ?? null,
    role: entry.role ?? null,
    company_id: entry.companyId ?? null,
    action: entry.action,
    entity: entry.entity,
    entity_id: entry.entityId ?? null,
    before_json: entry.before === undefined ? null : JSON.stringify(entry.before),
    after_json: entry.after === undefined ? null : JSON.stringify(entry.after),
    ip: entry.ip ?? null,
    device: entry.device ?? null,
    created_at: nowIso(),
  });
}

/** §2.11 Alertes automatiques du back-office. */
export function raiseAlert(
  alert: {
    kind: "TROU_SEQUENCE" | "ECART_CAISSE" | "ANNULATIONS_ANORMALES" | "PAIEMENT_INDETERMINE";
    body: string;
    companyId?: string | null;
    agencyId?: string | null;
    reference?: string | null;
    severity?: "BLOQUANTE" | "MAJEURE" | "MINEURE";
  },
  db: Database = getDb(),
): void {
  db.prepare(
    `INSERT INTO alerts (id, company_id, agency_id, kind, severity, body, reference, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
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
