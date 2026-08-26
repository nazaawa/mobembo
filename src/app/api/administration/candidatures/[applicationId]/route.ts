import { authedWith, body } from "@/lib/api/handler";
import { reviewPartnerApplication } from "@/lib/domain/partners";

export const POST = authedWith<{ applicationId: string }>(
  ["SUPER_ADMIN"],
  async ({ request, params, session }) => {
    const input = await body<{ decision: "APPROUVER" | "REFUSER"; motDePasseInitial?: string }>(request);
    return reviewPartnerApplication({
      applicationId: params.applicationId,
      decision: input.decision,
      initialPassword: input.motDePasseInitial,
      actor: { userId: session.userId, role: session.activeRole },
    });
  },
);
