import { authed } from "@/lib/api/handler";
import { tripsForAgencyToday } from "@/lib/domain/bookings";
import { errors } from "@/lib/core/errors";

/**
 * GET /api/guichet/trajets — §2.4.1 « L'agent choisit le trajet, filtré sur son
 * agence et la journée en cours. »
 */
export const GET = authed(["GUICHETIER", "GERANT_AGENCE"], async ({ session }) => {
  if (!session.agencyId) throw errors.forbidden("Aucune agence rattachée à ce rôle.");
  return { trajets: tripsForAgencyToday(session.agencyId) };
});
