import { authed, body } from "@/lib/api/handler";
import { getDb } from "@/lib/db";
import { switchRole, readSession } from "@/lib/auth/session";
import type { Role } from "@/lib/domain/types";

/**
 * POST /api/auth/role — §1.5 « Il bascule explicitement, et la bascule est
 * tracée. » Un utilisateur ne cumule jamais deux casquettes dans une session.
 */
export const POST = authed(null, async ({ request, session, ip, device }) => {
  const target = await body<{ role: Role; companyId: string | null; agencyId: string | null }>(
    request,
  );
  await switchRole(getDb(), session, target, { ip, device });
  return { session: await readSession(session.id) };
});
