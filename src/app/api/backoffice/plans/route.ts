import { authed, body } from "@/lib/api/handler";
import { getDb } from "@/lib/db";
import { createSeatMap, updateSeatMap } from "@/lib/domain/planning";
import { seatGrid, LAYOUT_PRESETS } from "@/lib/domain/seat-map";
import type { SeatMapLayout } from "@/lib/domain/types";
import type { SeatMapRow } from "@/lib/domain/repo";
import { getSeatMap } from "@/lib/domain/repo";
import { assertCompanyScope, companyScope } from "@/lib/auth/session";

/** GET — plans de sièges de la compagnie, avec leur grille rendue. */
export const GET = authed(["ADMIN_COMPAGNIE", "SUPER_ADMIN"], async ({ session }) => {
  const companyId = companyScope(session);
  const plans = await getDb()
    .prepare<SeatMapRow>(
      `SELECT *, row_count AS \`rows\` FROM seat_maps WHERE company_id = ? OR company_id IS NULL ORDER BY name`,
    )
    .all(companyId);

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
  const companyId = companyScope(session);
  return {
    plan: await createSeatMap({
      companyId,
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
  const plan = await getSeatMap(input.id);
  assertCompanyScope(session, plan.company_id!);
  return {
    plan: await updateSeatMap({
      seatMapId: input.id,
      name: input.nom,
      rows: input.rangees,
      layout: input.disposition,
      disabledSeats: input.siegesDesactives,
      actor: { userId: session.userId, role: session.activeRole },
    }),
  };
});
