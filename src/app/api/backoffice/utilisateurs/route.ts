import { authed, body } from "@/lib/api/handler";
import { getDb } from "@/lib/db";
import { createStaffUser } from "@/lib/auth";
import { errors } from "@/lib/core/errors";
import type { Role } from "@/lib/domain/types";

export const GET = authed(["ADMIN_COMPAGNIE", "SUPER_ADMIN"], async ({ session }) => ({
  utilisateurs: getDb()
    .prepare(
      `SELECT u.id, u.phone, u.name, u.status, u.created_at,
              GROUP_CONCAT(ur.role || COALESCE(' @' || a.name, '')) AS roles
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
  }>(request);
  if (input.motDePasse.length < 8) {
    throw errors.invalid("Le mot de passe doit faire au moins 8 caractères.");
  }

  const user = createStaffUser({
    phone: input.telephone,
    name: input.nom,
    password: input.motDePasse,
    roles: input.roles.map((r) => ({
      role: r.role,
      companyId: r.role === "SUPER_ADMIN" ? null : session.companyId,
      agencyId: r.agenceId ?? null,
    })),
    actor: { userId: session.userId, role: session.activeRole, companyId: session.companyId },
  });
  return { utilisateur: { id: user.id, phone: user.phone, name: user.name } };
});
