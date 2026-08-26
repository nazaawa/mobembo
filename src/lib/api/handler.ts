import { NextResponse, type NextRequest } from "next/server";
import { DomainError } from "@/lib/core/errors";
import { currentSession, type Session } from "@/lib/auth/session";
import type { Role } from "@/lib/domain/types";

/**
 * Enveloppe commune des route handlers : traduit les `DomainError` en réponses
 * HTTP au code stable, et laisse remonter tout le reste comme un 500 — une
 * erreur inattendue ne doit pas ressembler à un refus métier.
 */
export interface ApiContext {
  request: NextRequest;
  session: Session | null;
  ip: string | null;
  device: string | null;
}

export interface AuthedApiContext extends ApiContext {
  session: Session;
}

function requestMeta(request: NextRequest): { ip: string | null; device: string | null } {
  // `device_id` est VARCHAR(60) partout où il est persisté (cash_sessions,
  // sync_log, boarding_scans) : sans troncature, un appelant qui omet l'en-tête
  // dédié envoie le User-Agent complet du navigateur (bien plus long) et
  // l'INSERT échoue en 500 au lieu du refus métier attendu.
  const device = request.headers.get("x-mobembo-device") ?? request.headers.get("user-agent");
  return {
    ip:
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip"),
    device: device ? device.slice(0, 60) : null,
  };
}

function toResponse(error: unknown): NextResponse {
  if (error instanceof DomainError) {
    return NextResponse.json(
      { erreur: error.code, message: error.message, details: error.details },
      { status: error.status },
    );
  }
  console.error("[api] erreur non gérée", error);
  return NextResponse.json(
    { erreur: "ERREUR_INTERNE", message: "Erreur interne. L'incident est journalisé." },
    { status: 500 },
  );
}

export function handler(
  fn: (context: ApiContext) => Promise<NextResponse | unknown>,
): (request: NextRequest) => Promise<NextResponse> {
  return async (request: NextRequest) => {
    try {
      const session = await currentSession();
      const result = await fn({ request, session, ...requestMeta(request) });
      return result instanceof NextResponse ? result : NextResponse.json(result);
    } catch (error) {
      return toResponse(error);
    }
  };
}

/** Variante exigeant une session, et éventuellement un rôle actif précis. */
export function authed(
  roles: Role[] | null,
  fn: (context: AuthedApiContext) => Promise<NextResponse | unknown>,
): (request: NextRequest) => Promise<NextResponse> {
  return async (request: NextRequest) => {
    try {
      const session = await currentSession();
      if (!session) {
        return NextResponse.json(
          { erreur: "NON_AUTHENTIFIE", message: "Session absente ou expirée." },
          { status: 401 },
        );
      }
      if (roles && !roles.includes(session.activeRole)) {
        return NextResponse.json(
          {
            erreur: "INTERDIT",
            message: `Rôle ${session.activeRole} : action réservée à ${roles.join(" ou ")}.`,
          },
          { status: 403 },
        );
      }
      const result = await fn({ request, session, ...requestMeta(request) });
      return result instanceof NextResponse ? result : NextResponse.json(result);
    } catch (error) {
      return toResponse(error);
    }
  };
}

/** Handler avec paramètres de route (`/api/trajets/[tripId]`). */
export function authedWith<P>(
  roles: Role[] | null,
  fn: (context: AuthedApiContext & { params: P }) => Promise<NextResponse | unknown>,
): (request: NextRequest, ctx: { params: Promise<P> }) => Promise<NextResponse> {
  return async (request, ctx) => {
    try {
      const session = await currentSession();
      if (!session) {
        return NextResponse.json(
          { erreur: "NON_AUTHENTIFIE", message: "Session absente ou expirée." },
          { status: 401 },
        );
      }
      if (roles && !roles.includes(session.activeRole)) {
        return NextResponse.json(
          { erreur: "INTERDIT", message: `Action réservée à ${roles.join(" ou ")}.` },
          { status: 403 },
        );
      }
      const params = await ctx.params;
      const result = await fn({ request, session, params, ...requestMeta(request) });
      return result instanceof NextResponse ? result : NextResponse.json(result);
    } catch (error) {
      return toResponse(error);
    }
  };
}

export function handlerWith<P>(
  fn: (context: ApiContext & { params: P }) => Promise<NextResponse | unknown>,
): (request: NextRequest, ctx: { params: Promise<P> }) => Promise<NextResponse> {
  return async (request, ctx) => {
    try {
      const session = await currentSession();
      const params = await ctx.params;
      const result = await fn({ request, session, params, ...requestMeta(request) });
      return result instanceof NextResponse ? result : NextResponse.json(result);
    } catch (error) {
      return toResponse(error);
    }
  };
}

export async function body<T>(request: NextRequest): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new DomainError("REQUETE_INVALIDE", "Corps de requête JSON illisible.", 400);
  }
}
