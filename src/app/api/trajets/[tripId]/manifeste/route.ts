import { authedWith } from "@/lib/api/handler";
import { buildManifest } from "@/lib/domain/boarding";
import { assertCompanyScope } from "@/lib/auth/session";
import { getTrip } from "@/lib/domain/repo";

/**
 * GET /api/trajets/[tripId]/manifeste — §2.7 « Le contrôleur télécharge le
 * manifeste du voyage avant le départ, à la gare, avec réseau. »
 *
 * La réponse contient la clé HMAC de la compagnie : c'est elle qui rend la
 * vérification des QR possible hors-ligne, sans le moindre appel réseau.
 */
export const GET = authedWith<{ tripId: string }>(
  ["CONTROLEUR", "GERANT_AGENCE", "ADMIN_COMPAGNIE", "SUPER_ADMIN"],
  async ({ params, session }) => {
    const trip = await getTrip(params.tripId);
    assertCompanyScope(session, trip.company_id);
    return { manifeste: await buildManifest(params.tripId) };
  },
);
