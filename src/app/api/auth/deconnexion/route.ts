import { NextResponse } from "next/server";
import { handler } from "@/lib/api/handler";
import { logout } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/auth/session";

export const POST = handler(async ({ session }) => {
  if (session) await logout(session.id);
  const response = NextResponse.json({ deconnecte: true });
  response.cookies.delete(SESSION_COOKIE);
  return response;
});
