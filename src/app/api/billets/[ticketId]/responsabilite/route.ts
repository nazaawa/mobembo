import { authedWith, body } from "@/lib/api/handler";
import { applyLiability, LIABILITY_GRID, type LiabilitySituation } from "@/lib/domain/cancellation";
import { assertAgencyScope, assertCompanyScope } from "@/lib/auth/session";
import { getTicket, getTrip } from "@/lib/domain/repo";

/** GET — grille de responsabilité (annexe du contrat partenaire, §2.10). */
export const GET = authedWith<{ ticketId: string }>(
  ["GERANT_AGENCE", "ADMIN_COMPAGNIE", "SUPER_ADMIN"],
  async () => ({ grille: LIABILITY_GRID }),
);

/**
 * POST — applique la grille : la plateforme rembourse sous 48 h quel que soit
 * le responsable, puis récupère auprès de la compagnie via le reversement.
 */
export const POST = authedWith<{ ticketId: string }>(
  ["GERANT_AGENCE", "ADMIN_COMPAGNIE", "SUPER_ADMIN"],
  async ({ request, params, session }) => {
    const { situation, note } = await body<{ situation: LiabilitySituation; note?: string }>(
      request,
    );
    const ticket = await getTicket(params.ticketId);
    const trip = await getTrip(ticket.trip_id);
    assertCompanyScope(session, trip.company_id);
    if (trip.origin_agency_id) assertAgencyScope(session, trip.origin_agency_id);
    return await applyLiability({
      ticketId: params.ticketId,
      situation,
      note,
      actor: { userId: session.userId, role: session.activeRole, companyId: session.companyId },
    });
  },
);
