import { authed, body } from "@/lib/api/handler";
import { errors } from "@/lib/core/errors";
import { companyProfile, updateCompanyProfile } from "@/lib/domain/directory";

/**
 * Fiche publique de l'agence — Phase 1 §5.3 « Gestion du profil ».
 * Le gérant d'agence y a accès au même titre que la direction : c'est lui qui
 * connaît le numéro qui décroche vraiment.
 */
const ROLES = ["ADMIN_COMPAGNIE", "GERANT_AGENCE", "SUPER_ADMIN"] as const;

export const GET = authed([...ROLES], async ({ session }) => {
  if (!session.companyId) throw errors.invalid("Compagnie non déterminée.");
  return { fiche: await companyProfile(session.companyId) };
});

export const PATCH = authed([...ROLES], async ({ request, session }) => {
  if (!session.companyId) throw errors.invalid("Compagnie non déterminée.");
  const input = await body<{
    description?: string;
    telephone?: string;
    whatsapp?: string;
    email?: string;
    villeSiege?: string;
    adresse?: string;
    services?: string;
  }>(request);

  return {
    fiche: await updateCompanyProfile({
      companyId: session.companyId,
      description: input.description,
      phone: input.telephone,
      whatsapp: input.whatsapp,
      email: input.email,
      headOfficeCity: input.villeSiege,
      address: input.adresse,
      services: input.services,
      actor: { userId: session.userId, role: session.activeRole },
    }),
  };
});
