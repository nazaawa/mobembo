import { getDb, tx } from "@/lib/db";
import { newId, newOtp } from "@/lib/core/ids";
import { nowIso, plusMinutes, isPast } from "@/lib/core/time";
import { errors } from "@/lib/core/errors";
import { audit } from "@/lib/domain/audit";
import { queueSms, flushSmsQueue } from "@/lib/sms";
import type { Role } from "@/lib/domain/types";
import { rolesOf, type UserRow } from "@/lib/domain/repo";
import { hashOtp, hashPassword, verifyPassword } from "./password";
import { createSession, revokeSession, type Session } from "./session";

export * from "./session";
export { hashPassword, verifyPassword } from "./password";

const OTP_TTL_MINUTES = 5;
const OTP_MAX_ATTEMPTS = 5;

/** Normalise un numéro RDC vers le format international +243XXXXXXXXX. */
export function normalisePhone(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("00")) return `+${digits.slice(2)}`;
  if (digits.startsWith("243")) return `+${digits}`;
  if (digits.startsWith("0")) return `+243${digits.slice(1)}`;
  return `+243${digits}`;
}

export interface LoginResult {
  sessionId: string;
  session: Session;
}

/** Connexion staff : téléphone + mot de passe, puis choix du rôle actif. */
export async function loginStaff(params: {
  phone: string;
  password: string;
  role?: Role;
  agencyId?: string | null;
  ip?: string | null;
  device?: string | null;
}): Promise<{ sessionId: string; userId: string; activeRole: Role }> {
  const phone = normalisePhone(params.phone);
  return tx(async (db) => {
    const user = (await db.prepare<UserRow>(`SELECT * FROM users WHERE phone = ?`).get(phone)) as
      | UserRow
      | undefined;
    // Message unique : distinguer « numéro inconnu » de « mot de passe faux »
    // renseigne un attaquant sur les comptes existants.
    if (!user || !verifyPassword(params.password, user.password_hash)) {
      throw errors.unauthorized();
    }
    if (user.status !== "ACTIVE") throw errors.forbidden("Compte suspendu.");

    const allRoles = await rolesOf(user.id, db);
    const roles = allRoles.filter((r) => r.role !== "PASSAGER");
    if (roles.length === 0) throw errors.forbidden("Aucun rôle staff attribué à ce compte.");

    const chosen =
      roles.find(
        (r) =>
          (!params.role || r.role === params.role) &&
          (!params.agencyId || r.agency_id === params.agencyId),
      ) ?? roles[0];

    const sessionId = await createSession(db, user, chosen);
    await audit(
      {
        userId: user.id,
        role: chosen.role,
        companyId: chosen.company_id,
        action: "CONNEXION_STAFF",
        entity: "user",
        entityId: user.id,
        after: { role: chosen.role, agencyId: chosen.agency_id },
        ip: params.ip,
        device: params.device,
      },
      db,
    );
    return { sessionId, userId: user.id, activeRole: chosen.role };
  });
}

/**
 * §2.5 : « Pas de mot de passe : OTP par SMS. Le compte est créé au premier
 * achat. » L'envoi renvoie le code en clair uniquement hors production, pour
 * que la démonstration et les tests de recette soient jouables sans passerelle.
 */
export async function requestOtp(rawPhone: string): Promise<{ devCode?: string }> {
  const phone = normalisePhone(rawPhone);
  const code = newOtp();
  const db = getDb();

  await db.prepare(`DELETE FROM otp_codes WHERE phone = ? AND consumed_at IS NULL`).run(phone);
  await db
    .prepare(
      `INSERT INTO otp_codes (id, phone, code_hash, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    )
    .run(newId("otp"), phone, hashOtp(code, phone), plusMinutes(OTP_TTL_MINUTES), nowIso());

  await queueSms(
    db,
    phone,
    `MOBEMBO : votre code de connexion est ${code}. Valable ${OTP_TTL_MINUTES} minutes.`,
    "OTP",
  );
  await flushSmsQueue(db);

  return process.env.NODE_ENV === "production" ? {} : { devCode: code };
}

export async function verifyOtp(params: {
  phone: string;
  code: string;
  name?: string;
  ip?: string | null;
  device?: string | null;
}): Promise<{ sessionId: string; userId: string; created: boolean }> {
  const phone = normalisePhone(params.phone);
  return tx(async (db) => {
    const record = await db
      .prepare<{ id: string; code_hash: string; expires_at: string; attempts: number }>(
        `SELECT * FROM otp_codes WHERE phone = ? AND consumed_at IS NULL
          ORDER BY created_at DESC LIMIT 1`,
      )
      .get(phone);

    if (!record) throw errors.invalid("Aucun code en attente pour ce numéro.");
    if (isPast(record.expires_at)) throw errors.invalid("Code expiré, demandez-en un nouveau.");
    if (record.attempts >= OTP_MAX_ATTEMPTS) {
      throw errors.forbidden("Trop de tentatives. Demandez un nouveau code.");
    }

    if (record.code_hash !== hashOtp(params.code.trim(), phone)) {
      await db.prepare(`UPDATE otp_codes SET attempts = attempts + 1 WHERE id = ?`).run(record.id);
      throw errors.invalid("Code incorrect.");
    }
    await db.prepare(`UPDATE otp_codes SET consumed_at = ? WHERE id = ?`).run(nowIso(), record.id);

    let user = await db.prepare<UserRow>(`SELECT * FROM users WHERE phone = ?`).get(phone);
    let created = false;

    if (!user) {
      // « Le compte est créé au premier achat » (§2.5).
      const id = newId("usr");
      await db
        .prepare(
          `INSERT INTO users (id, phone, name, password_hash, status, locale, created_at)
         VALUES (?, ?, ?, NULL, 'ACTIVE', 'fr', ?)`,
        )
        .run(id, phone, params.name?.trim() || "Passager", nowIso());
      await db
        .prepare(
          `INSERT INTO user_roles (id, user_id, role, company_id, agency_id, created_at)
         VALUES (?, ?, 'PASSAGER', NULL, NULL, ?)`,
        )
        .run(newId("url"), id, nowIso());
      user = await db.prepare<UserRow>(`SELECT * FROM users WHERE id = ?`).get(id);
      created = true;
    } else if (params.name?.trim() && user.name === "Passager") {
      await db.prepare(`UPDATE users SET name = ? WHERE id = ?`).run(params.name.trim(), user.id);
    }

    const sessionId = await createSession(db, user as UserRow, {
      role: "PASSAGER",
      company_id: null,
      agency_id: null,
    });
    await audit(
      {
        userId: (user as UserRow).id,
        role: "PASSAGER",
        action: created ? "CREATION_COMPTE_PASSAGER" : "CONNEXION_PASSAGER",
        entity: "user",
        entityId: (user as UserRow).id,
        ip: params.ip,
        device: params.device,
      },
      db,
    );
    return { sessionId, userId: (user as UserRow).id, created };
  });
}

export async function logout(sessionId: string): Promise<void> {
  const db = getDb();
  await revokeSession(db, sessionId);
}

/** Création d'un compte staff par un administrateur. */
export async function createStaffUser(params: {
  phone: string;
  name: string;
  password: string;
  roles: { role: Role; companyId?: string | null; agencyId?: string | null }[];
  actor: { userId: string; role: string; companyId?: string | null };
}): Promise<UserRow> {
  const phone = normalisePhone(params.phone);
  return tx(async (db) => {
    const existing = await db.prepare<UserRow>(`SELECT * FROM users WHERE phone = ?`).get(phone);
    if (existing) {
      throw errors.conflict(
        "UTILISATEUR_EXISTANT",
        "Un compte utilise déjà ce numéro. Utilisez le parcours de modification sécurisé.",
      );
    }
    const userId = newId("usr");
    await db
      .prepare(
        `INSERT INTO users (id, phone, name, password_hash, status, locale, created_at)
         VALUES (?, ?, ?, ?, 'ACTIVE', 'fr', ?)`,
      )
      .run(userId, phone, params.name, hashPassword(params.password), nowIso());

    const insertRole = db.prepare(
      `INSERT IGNORE INTO user_roles (id, user_id, role, company_id, agency_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    for (const role of params.roles) {
      await insertRole.run(
        newId("url"),
        userId,
        role.role,
        role.companyId ?? null,
        role.agencyId ?? null,
        nowIso(),
      );
    }

    await audit(
      {
        userId: params.actor.userId,
        role: params.actor.role,
        companyId: params.actor.companyId,
        action: "CREATION_UTILISATEUR",
        entity: "user",
        entityId: userId,
        after: { phone, name: params.name, roles: params.roles },
      },
      db,
    );

    return (await db.prepare<UserRow>(`SELECT * FROM users WHERE id = ?`).get(userId)) as UserRow;
  });
}
