import { authed, body } from "@/lib/api/handler";
import { getDb } from "@/lib/db";
import { selectCompanyContext } from "@/lib/auth/session";

export const POST = authed(["SUPER_ADMIN"], async ({ request, session }) => {
  const { compagnieId } = await body<{ compagnieId: string }>(request);
  await selectCompanyContext(getDb(), session, compagnieId);
  return { selectionnee: compagnieId };
});
