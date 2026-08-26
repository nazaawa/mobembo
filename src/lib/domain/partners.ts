import { randomBytes } from "node:crypto";
import { getDb, tx, type DbHandle } from "@/lib/db";
import { normalisePhone } from "@/lib/auth";
import { hashPassword } from "@/lib/auth/password";
import { newId } from "@/lib/core/ids";
import { errors } from "@/lib/core/errors";
import { nowIso } from "@/lib/core/time";
import { audit } from "./audit";
import { DEFAULT_POLICY } from "./types";

export interface PartnerApplicationRow {
  id: string;
  company_name: string;
  contact_name: string;
  phone: string;
  email: string | null;
  city: string;
  agency_name: string;
  destinations: string | null;
  fleet_size: number | null;
  status: "EN_ATTENTE" | "APPROUVEE" | "REFUSEE";
  company_id: string | null;
  created_at: string;
}

export async function createPartnerApplication(input: {
  companyName: string;
  contactName: string;
  phone: string;
  email?: string;
  city: string;
  agencyName: string;
  destinations?: string;
  fleetSize?: number;
}, db: DbHandle = getDb()): Promise<PartnerApplicationRow> {
  const required = [input.companyName, input.contactName, input.phone, input.city, input.agencyName];
  if (required.some((value) => !value.trim())) throw errors.invalid("Complétez les champs obligatoires.");
  if (input.fleetSize !== undefined && (!Number.isInteger(input.fleetSize) || input.fleetSize < 0)) {
    throw errors.invalid("Le nombre de bus doit être un entier positif.");
  }
  const phone = normalisePhone(input.phone);
  const duplicate = await db
    .prepare<{ id: string }>(`SELECT id FROM partner_applications WHERE phone = ? AND status = 'EN_ATTENTE'`)
    .get(phone);
  if (duplicate) throw errors.conflict("CANDIDATURE_EXISTANTE", "Une demande est déjà en cours pour ce numéro.");

  const id = newId("par");
  await db
    .prepare(
      `INSERT INTO partner_applications
       (id, company_name, contact_name, phone, email, city, agency_name, destinations,
        fleet_size, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'EN_ATTENTE', ?)`,
    )
    .run(
      id,
      input.companyName.trim(),
      input.contactName.trim(),
      phone,
      input.email?.trim() || null,
      input.city.trim(),
      input.agencyName.trim(),
      input.destinations?.trim() || null,
      input.fleetSize ?? null,
      nowIso(),
    );
  return (await db.prepare<PartnerApplicationRow>(`SELECT * FROM partner_applications WHERE id = ?`).get(id))!;
}

export async function reviewPartnerApplication(input: {
  applicationId: string;
  decision: "APPROUVER" | "REFUSER";
  initialPassword?: string;
  actor: { userId: string; role: string };
}): Promise<{ companyId: string | null }> {
  return tx(async (db) => {
    const application = await db
      .prepare<PartnerApplicationRow>(`SELECT * FROM partner_applications WHERE id = ? FOR UPDATE`)
      .get(input.applicationId);
    if (!application) throw errors.notFound("Candidature");
    if (application.status !== "EN_ATTENTE") {
      throw errors.conflict("CANDIDATURE_TRAITEE", "Cette candidature a déjà été traitée.");
    }

    if (input.decision === "REFUSER") {
      await db
        .prepare(`UPDATE partner_applications SET status = 'REFUSEE', reviewed_by = ?, reviewed_at = ? WHERE id = ?`)
        .run(input.actor.userId, nowIso(), input.applicationId);
      await audit({
        userId: input.actor.userId,
        role: input.actor.role,
        action: "REFUS_PARTENAIRE",
        entity: "partner_application",
        entityId: input.applicationId,
      }, db);
      return { companyId: null };
    }

    if (!input.initialPassword || input.initialPassword.length < 8) {
      throw errors.invalid("Le mot de passe initial doit faire au moins 8 caractères.");
    }
    const existingCompany = await db
      .prepare<{ id: string }>(`SELECT id FROM companies WHERE LOWER(name) = LOWER(?)`)
      .get(application.company_name);
    if (existingCompany) throw errors.conflict("COMPAGNIE_EXISTANTE", "Cette compagnie existe déjà.");

    const companyId = newId("cmp");
    const agencyId = newId("agc");
    const userId = newId("usr");
    const now = nowIso();
    await db
      .prepare(
        `INSERT INTO companies
         (id, name, status, commission_rate, currency_rate_usd_cdf, qr_secret, policy_json, created_at)
         VALUES (?, ?, 'ACTIVE', 0.06, 2800, ?, ?, ?)`,
      )
      .run(companyId, application.company_name, randomBytes(32).toString("hex"), JSON.stringify(DEFAULT_POLICY), now);
    await db
      .prepare(
        `INSERT INTO agencies
         (id, company_id, name, city, status, ticket_sequence, created_at)
         VALUES (?, ?, ?, ?, 'ACTIVE', 0, ?)`,
      )
      .run(agencyId, companyId, application.agency_name, application.city, now);

    const existingUser = await db.prepare<{ id: string; password_hash: string | null }>(`SELECT id, password_hash FROM users WHERE phone = ?`).get(application.phone);
    const adminUserId = existingUser?.id ?? userId;
    if (existingUser?.password_hash) {
      throw errors.conflict("UTILISATEUR_EXISTANT", "Ce numéro appartient déjà à un compte staff.");
    }
    if (existingUser) {
      await db.prepare(`UPDATE users SET name = ?, password_hash = ? WHERE id = ?`).run(application.contact_name, hashPassword(input.initialPassword), adminUserId);
    } else {
      await db
        .prepare(`INSERT INTO users (id, phone, name, password_hash, status, locale, created_at) VALUES (?, ?, ?, ?, 'ACTIVE', 'fr', ?)`)
        .run(adminUserId, application.phone, application.contact_name, hashPassword(input.initialPassword), now);
    }
    await db
      .prepare(`INSERT INTO user_roles (id, user_id, role, company_id, agency_id, created_at) VALUES (?, ?, 'ADMIN_COMPAGNIE', ?, NULL, ?)`) 
      .run(newId("url"), adminUserId, companyId, now);
    await db
      .prepare(`UPDATE partner_applications SET status = 'APPROUVEE', company_id = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ?`)
      .run(companyId, input.actor.userId, now, input.applicationId);
    await audit({
      userId: input.actor.userId,
      role: input.actor.role,
      companyId,
      action: "APPROBATION_PARTENAIRE",
      entity: "partner_application",
      entityId: input.applicationId,
      after: { companyId, agencyId, adminUserId },
    }, db);
    return { companyId };
  });
}
