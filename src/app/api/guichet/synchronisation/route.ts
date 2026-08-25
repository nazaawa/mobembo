import { authed, body } from "@/lib/api/handler";
import { posSell, type PassengerInput } from "@/lib/domain/bookings";
import { DomainError } from "@/lib/core/errors";
import { errors } from "@/lib/core/errors";
import type { Currency } from "@/lib/core/money";

interface OfflineSale {
  clientOpId: string;
  clientTime: string;
  tripId: string;
  sieges: string[];
  passagers: PassengerInput[];
  telephone: string;
  nom: string;
  caisseId: string;
  devise: Currency;
}

/**
 * POST /api/guichet/synchronisation — §2.4 mode dégradé.
 *
 * « Synchronisation automatique au retour du réseau, résolution de conflit par
 * horodatage serveur. » Chaque vente porte un `clientOpId` : rejouer le lot
 * entier est sans conséquence. Un refus n'interrompt pas le lot — le POS doit
 * pouvoir vider sa file même si une vente est litigieuse.
 */
export const POST = authed(
  ["GUICHETIER", "GERANT_AGENCE"],
  async ({ request, session, ip, device }) => {
    if (!session.agencyId || !session.companyId) {
      throw errors.forbidden("Aucune agence rattachée à ce rôle.");
    }
    const { ventes } = await body<{ ventes: OfflineSale[] }>(request);

    const resultats = [];
    for (const vente of ventes) {
      try {
        const result = await posSell({
          tripId: vente.tripId,
          seatNumbers: vente.sieges,
          passengers: vente.passagers,
          buyerPhone: vente.telephone,
          buyerName: vente.nom,
          cashSessionId: vente.caisseId,
          currency: vente.devise,
          actor: {
            userId: session.userId,
            role: session.activeRole,
            companyId: session.companyId!,
            agencyId: session.agencyId!,
          },
          clientOpId: vente.clientOpId,
          clientTime: vente.clientTime,
          deviceId: device ?? undefined,
          ip,
        });
        resultats.push({
          clientOpId: vente.clientOpId,
          statut: "APPLIQUE" as const,
          billets: result.tickets.map((t) => ({
            code: t.ticket_code,
            sequence: t.sequence_number,
            qr: t.qr_signature,
          })),
        });
      } catch (error) {
        resultats.push({
          clientOpId: vente.clientOpId,
          statut: "REFUSE" as const,
          erreur: error instanceof DomainError ? error.code : "ERREUR_INTERNE",
          message: error instanceof DomainError ? error.message : "Erreur interne.",
        });
      }
    }

    return {
      resultats,
      appliquees: resultats.filter((r) => r.statut === "APPLIQUE").length,
      refusees: resultats.filter((r) => r.statut === "REFUSE").length,
    };
  },
);
