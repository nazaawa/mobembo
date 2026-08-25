import { authed, body } from "@/lib/api/handler";
import { getDb } from "@/lib/db";
import { createBus } from "@/lib/domain/planning";
import { errors } from "@/lib/core/errors";
import type { BusCategory } from "@/lib/domain/types";

export const GET = authed(
  ["ADMIN_COMPAGNIE", "GERANT_AGENCE", "SUPER_ADMIN"],
  async ({ session }) => ({
    bus: await getDb()
      .prepare(
        `SELECT b.*, m.name AS plan, m.seat_count AS places
         FROM buses b JOIN seat_maps m ON m.id = b.seat_map_id
        WHERE b.company_id = ? ORDER BY b.plate_number`,
      )
      .all(session.companyId),
  }),
);

export const POST = authed(["ADMIN_COMPAGNIE", "SUPER_ADMIN"], async ({ request, session }) => {
  if (!session.companyId) throw errors.invalid("Compagnie non déterminée.");
  const input = await body<{ plaque: string; planId: string; categorie: BusCategory }>(request);
  return await createBus({
    companyId: session.companyId,
    plateNumber: input.plaque,
    seatMapId: input.planId,
    category: input.categorie,
    actor: { userId: session.userId, role: session.activeRole },
  });
});
