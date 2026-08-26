import { body, handler } from "@/lib/api/handler";
import { createPartnerApplication } from "@/lib/domain/partners";
import type { PartnerApplicationType } from "@/lib/domain/types";

export const POST = handler(async ({ request }) => {
  const input = await body<{
    type?: PartnerApplicationType;
    compagnie?: string;
    contact: string;
    telephone: string;
    email?: string;
    ville: string;
    agence?: string;
    destinations?: string;
    nombreBus?: number;
  }>(request);
  const candidature = await createPartnerApplication({
    applicationType: input.type,
    companyName: input.compagnie,
    contactName: input.contact,
    phone: input.telephone,
    email: input.email,
    city: input.ville,
    agencyName: input.agence,
    destinations: input.destinations,
    fleetSize: input.nombreBus,
  });
  return { candidature: { id: candidature.id, status: candidature.status } };
});
