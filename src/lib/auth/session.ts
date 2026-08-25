import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { DbHandle } from "@/lib/db";
import { getDb } from "@/lib/db";
import { newId } from "@/lib/core/ids";
import { nowIso, plusDays, isPast } from "@/lib/core/time";
import { errors } from "@/lib/core/errors";
import { audit } from "@/lib/domain/audit";
import type { Role } from "@/lib/domain/types";
import { rolesOf, type UserRow } from "@/lib/domain/repo";

export const SESSION_COOKIE = "mobembo_session";

function secret(): string {
  return process.env.MOBEMBO_SESSION_SECRET ?? "mobembo-dev-secret-a-remplacer-en-production";
}

/**
 * Le cookie porte `sessionId.signature`. L'identifiant seul ne suffit pas :
 * sans la signature HMAC, deviner un identifiant de session ouvrirait un
 * guichet. La session reste stockée en base pour pouvoir être révoquée — un
 * jeton auto-porteur ne s'annule pas.
 */
function signSessionId(sessionId: string): string {
  return createHmac("sha256", secret()).update(sessionId).digest("base64url");
}

export function sealSession(sessionId: string): string {
  return `${sessionId}.${signSessionId(sessionId)}`;
}

export function unsealSession(sealed: string | undefined): string | null {
  if (!sealed) return null;
  const index = sealed.lastIndexOf(".");
  if (index <= 0) return null;
  const sessionId = sealed.slice(0, index);
  const signature = sealed.slice(index + 1);
  const expected = signSessionId(sessionId);
  if (expected.length !== signature.length) return null;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(signature)) ? sessionId : null;
}

export interface Session {
  id: string;
  userId: string;
  name: string;
  phone: string;
  /** §1.5 : une seule casquette active par session. */
  activeRole: Role;
  companyId: string | null;
  agencyId: string | null;
  availableRoles: { role: Role; companyId: string | null; agencyId: string | null }[];
}

export async function createSession(
  db: DbHandle,
  user: UserRow,
  role: { role: Role; company_id: string | null; agency_id: string | null },
): Promise<string> {
  const id = newId("ses");
  await db
    .prepare(
      `INSERT INTO auth_sessions
       (id, user_id, active_role, company_id, agency_id, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, user.id, role.role, role.company_id, role.agency_id, nowIso(), plusDays(30));
  return id;
}

export async function readSession(sessionId: string, db: DbHandle = getDb()): Promise<Session | null> {
  const row = await db
    .prepare<{
      id: string;
      user_id: string;
      active_role: Role;
      company_id: string | null;
      agency_id: string | null;
      expires_at: string;
      revoked_at: string | null;
      name: string;
      phone: string;
      user_status: string;
    }>(
      `SELECT s.*, u.name, u.phone, u.status AS user_status
         FROM auth_sessions s JOIN users u ON u.id = s.user_id
        WHERE s.id = ?`,
    )
    .get(sessionId);

  if (!row || row.revoked_at || row.user_status !== "ACTIVE") return null;
  if (isPast(row.expires_at)) return null;

  const roles = await rolesOf(row.user_id, db);
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    phone: row.phone,
    activeRole: row.active_role,
    companyId: row.company_id,
    agencyId: row.agency_id,
    availableRoles: roles.map((r) => ({
      role: r.role,
      companyId: r.company_id,
      agencyId: r.agency_id,
    })),
  };
}

/** Session de la requête courante, ou `null`. */
export async function currentSession(): Promise<Session | null> {
  const store = await cookies();
  const sessionId = unsealSession(store.get(SESSION_COOKIE)?.value);
  return sessionId ? readSession(sessionId) : null;
}

export async function requireSession(): Promise<Session> {
  const session = await currentSession();
  if (!session) throw errors.unauthorized();
  return session;
}

/**
 * Contrôle d'accès par rôle actif. §3.3 : « Séparation stricte des rôles, une
 * seule casquette active par session. » Un gérant qui veut vendre bascule
 * explicitement en GUICHETIER — il ne cumule pas les droits.
 */
export async function requireRole(...allowed: Role[]): Promise<Session> {
  const session = await requireSession();
  if (!allowed.includes(session.activeRole)) {
    throw errors.forbidden(
      `Rôle ${session.activeRole} : action réservée à ${allowed.join(" ou ")}. Basculez de rôle.`,
    );
  }
  return session;
}

/** §1.5 : « Il bascule explicitement, et la bascule est tracée. » */
export async function switchRole(
  db: DbHandle,
  session: Session,
  target: { role: Role; companyId: string | null; agencyId: string | null },
  context?: { ip?: string | null; device?: string | null },
): Promise<void> {
  const owns = session.availableRoles.some(
    (r) =>
      r.role === target.role &&
      r.companyId === target.companyId &&
      r.agencyId === target.agencyId,
  );
  if (!owns) throw errors.forbidden("Ce rôle n'est pas attribué à votre compte.");

  await db
    .prepare(`UPDATE auth_sessions SET active_role = ?, company_id = ?, agency_id = ? WHERE id = ?`)
    .run(target.role, target.companyId, target.agencyId, session.id);

  await audit(
    {
      userId: session.userId,
      role: session.activeRole,
      companyId: target.companyId,
      action: "BASCULE_ROLE",
      entity: "auth_session",
      entityId: session.id,
      before: { role: session.activeRole, agencyId: session.agencyId },
      after: { role: target.role, agencyId: target.agencyId },
      ip: context?.ip,
      device: context?.device,
    },
    db,
  );
}

export async function revokeSession(db: DbHandle, sessionId: string): Promise<void> {
  await db.prepare(`UPDATE auth_sessions SET revoked_at = ? WHERE id = ?`).run(nowIso(), sessionId);
}

/** Une compagnie ne voit jamais les données d'une autre. */
export function assertCompanyScope(session: Session, companyId: string): void {
  if (session.activeRole === "SUPER_ADMIN") return;
  if (session.companyId !== companyId) {
    throw errors.forbidden("Cette ressource appartient à une autre compagnie.");
  }
}

export function assertAgencyScope(session: Session, agencyId: string): void {
  if (session.activeRole === "SUPER_ADMIN" || session.activeRole === "ADMIN_COMPAGNIE") return;
  if (session.agencyId !== agencyId) {
    throw errors.forbidden("Cette ressource appartient à une autre agence.");
  }
}
