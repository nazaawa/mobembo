import { authed, body } from "@/lib/api/handler";
import { getDb } from "@/lib/db";
import { createSeatMap, updateSeatMap } from "@/lib/domain/planning";
import { seatGrid, LAYOUT_PRESETS } from "@/lib/domain/seat-map";
import type { SeatMapLayout } from "@/lib/domain/types";
import type { SeatMapRow } from "@/lib/domain/repo";

/** GET — plans de sièges de la compagnie, avec leur grille rendue. */
export const GET = authed(["ADMIN_COMPAGNIE", "SUPER_ADMIN"], async ({ session }) => {
  const plans = getDb()
    .prepare(`SELECT * FROM seat_maps WHERE company_id = ? OR company_id IS NULL ORDER BY name`)
    .all(session.companyId) as SeatMapRow[];

  return {
    plans: plans.map((plan) => ({
      ...plan,
      grille: seatGrid(
        plan.rows,
        JSON.parse(plan.layout_json) as SeatMapLayout,
        JSON.parse(plan.disabled_seats) as string[],
      ),
    })),
    dispositions: LAYOUT_PRESETS,
  };
});

/** POST/PUT — §2.1 « Il est éditable graphiquement dans le back-office. » */
export const POST = authed(["ADMIN_COMPAGNIE", "SUPER_ADMIN"], async ({ request, session }) => {
  const input = await body<{
    nom: string;
    rangees: number;
    disposition: SeatMapLayout;
    siegesDesactives: string[];
  }>(request);
  return {
    plan: createSeatMap({
      companyId: session.companyId,
      name: input.nom,
      rows: input.rangees,
      layout: input.disposition,
      disabledSeats: input.siegesDesactives,
      actor: { userId: session.userId, role: session.activeRole },
    }),
  };
});

export const PUT = authed(["ADMIN_COMPAGNIE", "SUPER_ADMIN"], async ({ request, session }) => {
  const input = await body<{
    id: string;
    nom: string;
    rangees: number;
    disposition: SeatMapLayout;
    siegesDesactives: string[];
  }>(request);
  return {
    plan: updateSeatMap({
      seatMapId: input.id,
      name: input.nom,
      rows: input.rangees,
      layout: input.disposition,
      disabledSeats: input.siegesDesactives,
      actor: { userId: session.userId, role: session.activeRole },
    }),
  };
});
