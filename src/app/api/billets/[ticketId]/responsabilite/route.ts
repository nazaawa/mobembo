import { authedWith, body } from "@/lib/api/handler";
import { applyLiability, LIABILITY_GRID, type LiabilitySituation } from "@/lib/domain/cancellation";

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
    return applyLiability({
      ticketId: params.ticketId,
      situation,
      note,
      actor: { userId: session.userId, role: session.activeRole, companyId: session.companyId },
    });
  },
);
