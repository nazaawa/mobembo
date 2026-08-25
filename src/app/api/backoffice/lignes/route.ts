import { authed, body } from "@/lib/api/handler";
import { getDb } from "@/lib/db";
import { createRoute } from "@/lib/domain/planning";
import { errors } from "@/lib/core/errors";

export const GET = authed(
  ["ADMIN_COMPAGNIE", "GERANT_AGENCE", "SUPER_ADMIN"],
  async ({ session }) => ({
    lignes: await getDb()
      .prepare(`SELECT * FROM routes WHERE company_id = ? ORDER BY origin_city, destination_city`)
      .all(session.companyId),
  }),
);

export const POST = authed(["ADMIN_COMPAGNIE", "SUPER_ADMIN"], async ({ request, session }) => {
  if (!session.companyId) throw errors.invalid("Compagnie non déterminée.");
  const input = await body<{
    origine: string;
    destination: string;
    distanceKm?: number;
    dureeMin?: number;
  }>(request);
  return {
    ligne: await createRoute({
      companyId: session.companyId,
      originCity: input.origine,
      destinationCity: input.destination,
      distanceKm: input.distanceKm,
      durationEstMin: input.dureeMin,
    }),
  };
});
