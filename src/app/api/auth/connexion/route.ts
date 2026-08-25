import { NextResponse } from "next/server";
import { handler, body } from "@/lib/api/handler";
import { loginStaff } from "@/lib/auth";
import { sealSession, readSession, SESSION_COOKIE } from "@/lib/auth/session";
import type { Role } from "@/lib/domain/types";

/** POST /api/auth/connexion — connexion staff (téléphone + mot de passe). */
export const POST = handler(async ({ request, ip, device }) => {
  const input = await body<{ phone: string; password: string; role?: Role; agencyId?: string }>(
    request,
  );
  const { sessionId } = await loginStaff({ ...input, ip, device });

  const response = NextResponse.json({ session: await readSession(sessionId) });
  response.cookies.set(SESSION_COOKIE, sealSession(sessionId), {
    httpOnly: true,
    sameSite: "lax",
    // §3.3 « HTTPS strict » : le cookie n'est jamais émis en clair en production.
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 30 * 86_400,
  });
  return response;
});
