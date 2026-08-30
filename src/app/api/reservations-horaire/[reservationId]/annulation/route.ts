import { authedWith, body } from "@/lib/api/handler";
import { errors } from "@/lib/core/errors";
import { cancelReservation } from "@/lib/domain/reservations";

/**
 * POST /api/reservations-horaire/[id]/annulation
 *
 * Deux annulateurs légitimes, deux preuves différentes : le voyageur prouve
 * son numéro par la session OTP, l'agence prouve son périmètre par sa session
 * staff et doit motiver l'annulation — le voyageur reçoit ce motif par SMS.
 */
export const POST = authedWith<{ reservationId: string }>(
  ["PASSAGER", "ADMIN_COMPAGNIE", "GERANT_AGENCE", "GUICHETIER", "SUPER_ADMIN"],
  async ({ request, session, params }) => {
    const input = await body<{ motif?: string }>(request).catch(() => ({ motif: undefined }));

    if (session.activeRole === "PASSAGER") {
      return {
        reservation: await cancelReservation({
          reservationId: params.reservationId,
          by: "VOYAGEUR",
          phone: session.phone,
        }),
      };
    }

    if (!session.companyId) throw errors.invalid("Compagnie non déterminée.");
    return {
      reservation: await cancelReservation({
        reservationId: params.reservationId,
        by: "AGENCE",
        reason: input.motif,
        companyId: session.activeRole === "SUPER_ADMIN" ? null : session.companyId,
        actor: { userId: session.userId, role: session.activeRole },
      }),
    };
  },
);
