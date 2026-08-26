import { body, handler } from "@/lib/api/handler";
import { createPartnerApplication } from "@/lib/domain/partners";

export const POST = handler(async ({ request }) => {
  const input = await body<{
    compagnie: string;
    contact: string;
    telephone: string;
    email?: string;
    ville: string;
    agence: string;
    destinations?: string;
    nombreBus?: number;
  }>(request);
  const candidature = await createPartnerApplication({
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
