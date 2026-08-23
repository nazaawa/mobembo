import { NextResponse } from "next/server";
import { handler, body } from "@/lib/api/handler";
import { verifyOtp } from "@/lib/auth";
import { sealSession, readSession, SESSION_COOKIE } from "@/lib/auth/session";

/** POST /api/auth/otp/verification — valide le code et ouvre la session passager. */
export const POST = handler(async ({ request, ip, device }) => {
  const input = await body<{ phone: string; code: string; name?: string }>(request);
  const { sessionId, created } = verifyOtp({ ...input, ip, device });

  const response = NextResponse.json({ session: readSession(sessionId), compteCree: created });
  response.cookies.set(SESSION_COOKIE, sealSession(sessionId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 30 * 86_400,
  });
  return response;
});
