import { authed, body } from "@/lib/api/handler";
import { getDb } from "@/lib/db";
import { createTrip, cancelTrip } from "@/lib/domain/planning";
import { errors } from "@/lib/core/errors";
import type { BusCategory, Channel, DepartureMode } from "@/lib/domain/types";

/** GET — trajets planifiés de la compagnie, avec leur remplissage par canal. */
export const GET = authed(
  ["ADMIN_COMPAGNIE", "GERANT_AGENCE", "SUPER_ADMIN"],
  async ({ request, session }) => {
    const limit = Math.min(Number(request.nextUrl.searchParams.get("limite") ?? 60), 200);
    return {
      trajets: await getDb()
        .prepare(
          `SELECT t.*, r.origin_city, r.destination_city, b.plate_number, b.category,
                  a.name AS agence,
                  (SELECT COUNT(*) FROM trip_seats s WHERE s.trip_id = t.id) AS sieges,
                  (SELECT COUNT(*) FROM trip_seats s WHERE s.trip_id = t.id AND s.status IN ('VENDU','EMBARQUE')) AS vendus,
                  (SELECT COUNT(*) FROM trip_seats s WHERE s.trip_id = t.id AND s.channel = 'GUICHET' AND s.status = 'DISPONIBLE') AS libresGuichet,
                  (SELECT COUNT(*) FROM trip_seats s WHERE s.trip_id = t.id AND s.channel = 'EN_LIGNE' AND s.status = 'DISPONIBLE') AS libresEnLigne
             FROM trips t
             JOIN routes r ON r.id = t.route_id
             JOIN buses b ON b.id = t.bus_id
             LEFT JOIN agencies a ON a.id = t.origin_agency_id
            WHERE t.company_id = ?
            ORDER BY t.departure_datetime DESC LIMIT ?`,
        )
        .all(session.companyId, limit),
    };
  },
);

/** POST — §2.2 création d'un trajet avec sa grille tarifaire et son allocation. */
export const POST = authed(["ADMIN_COMPAGNIE", "SUPER_ADMIN"], async ({ request, session }) => {
  if (!session.companyId) throw errors.invalid("Compagnie non déterminée.");
  const input = await body<{
    ligneId: string;
    busId: string;
    agenceId: string | null;
    depart: string;
    mode: DepartureMode;
    tarifs: Array<{ categorie: BusCategory; prixUsd: number; prixCdf: number }>;
    quotas: Record<Channel, number>;
  }>(request);

  return {
    trajet: await createTrip({
      companyId: session.companyId,
      routeId: input.ligneId,
      busId: input.busId,
      originAgencyId: input.agenceId,
      departureDatetime: input.depart,
      departureMode: input.mode,
      prices: input.tarifs.map((t) => ({
        category: t.categorie,
        priceUsd: t.prixUsd,
        priceCdf: t.prixCdf,
      })),
      quotas: input.quotas,
      actor: { userId: session.userId, role: session.activeRole },
    }),
  };
});

/** DELETE — annulation d'un trajet, motif obligatoire et journalisé. */
export const DELETE = authed(["ADMIN_COMPAGNIE", "SUPER_ADMIN"], async ({ request, session }) => {
  const { trajetId, motif } = await body<{ trajetId: string; motif: string }>(request);
  return await cancelTrip({
    tripId: trajetId,
    reason: motif,
    actor: { userId: session.userId, role: session.activeRole, companyId: session.companyId },
  });
});
