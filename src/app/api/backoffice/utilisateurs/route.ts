import { authed, body } from "@/lib/api/handler";
import { getDb } from "@/lib/db";
import { createStaffUser } from "@/lib/auth";
import { errors } from "@/lib/core/errors";
import { companyScope } from "@/lib/auth/session";
import type { Role } from "@/lib/domain/types";

export const GET = authed(["ADMIN_COMPAGNIE", "SUPER_ADMIN"], async ({ session }) => ({
  utilisateurs: await getDb()
    .prepare(
      `SELECT u.id, u.phone, u.name, u.status, u.created_at,
              GROUP_CONCAT(CONCAT(ur.role, COALESCE(CONCAT(' @', a.name), ''))) AS roles
         FROM users u
         JOIN user_roles ur ON ur.user_id = u.id
         LEFT JOIN agencies a ON a.id = ur.agency_id
        WHERE ur.company_id = ? AND ur.role <> 'PASSAGER'
        GROUP BY u.id ORDER BY u.name`,
    )
    .all(session.companyId),
}));

/** POST — création d'un compte staff (§3.3 mot de passe haché). */
export const POST = authed(["ADMIN_COMPAGNIE", "SUPER_ADMIN"], async ({ request, session }) => {
  const input = await body<{
    telephone: string;
    nom: string;
    motDePasse: string;
    roles: Array<{ role: Role; agenceId?: string | null }>;
    compagnieId?: string;
  }>(request);
  if (input.motDePasse.length < 8) {
    throw errors.invalid("Le mot de passe doit faire au moins 8 caractères.");
  }

  const allowedRoles: Role[] = ["ADMIN_COMPAGNIE", "GERANT_AGENCE", "GUICHETIER", "CONTROLEUR"];
  if (input.roles.length === 0 || input.roles.some((item) => !allowedRoles.includes(item.role))) {
    throw errors.forbidden("Seuls les rôles de compagnie peuvent être attribués ici.");
  }
  const targetCompanyId = companyScope(session, input.compagnieId);
  const agencyIds = input.roles.map((role) => role.agenceId).filter(Boolean) as string[];
  if (agencyIds.length > 0) {
    const placeholders = agencyIds.map(() => "?").join(",");
    const rows = await getDb()
      .prepare<{ id: string }>(`SELECT id FROM agencies WHERE company_id = ? AND id IN (${placeholders})`)
      .all(targetCompanyId, ...agencyIds);
    if (rows.length !== new Set(agencyIds).size) {
      throw errors.forbidden("Une agence sélectionnée appartient à une autre compagnie.");
    }
  }

  const user = await createStaffUser({
    phone: input.telephone,
    name: input.nom,
    password: input.motDePasse,
    roles: input.roles.map((r) => ({
      role: r.role,
      companyId: targetCompanyId,
      agencyId: r.agenceId ?? null,
    })),
    actor: { userId: session.userId, role: session.activeRole, companyId: targetCompanyId },
  });
  return { utilisateur: { id: user.id, phone: user.phone, name: user.name } };
});
