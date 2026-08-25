import { authed, body } from "@/lib/api/handler";
import { openCashSession, openSessionFor, cashSessionSummary } from "@/lib/domain/cash";
import { errors } from "@/lib/core/errors";
import type { Currency } from "@/lib/core/money";

/** GET — session de caisse ouverte de l'agent, avec son état courant. */
export const GET = authed(["GUICHETIER", "GERANT_AGENCE"], async ({ session }) => {
  if (!session.agencyId) throw errors.forbidden("Aucune agence rattachée à ce rôle.");
  const open = await openSessionFor(session.userId, session.agencyId);
  return { session: open ? await cashSessionSummary(open.id) : null };
});

/** POST — §2.4 ouverture : fond de caisse, horodatage, identification. */
export const POST = authed(
  ["GUICHETIER", "GERANT_AGENCE"],
  async ({ request, session, device }) => {
    if (!session.agencyId) throw errors.forbidden("Aucune agence rattachée à ce rôle.");
    const { fondInitial, devise } = await body<{ fondInitial: number; devise: Currency }>(request);
    const opened = await openCashSession({
      agencyId: session.agencyId,
      userId: session.userId,
      openingFloat: fondInitial,
      currency: devise,
      deviceId: device,
      actorRole: session.activeRole,
    });
    return { session: await cashSessionSummary(opened.id) };
  },
);
