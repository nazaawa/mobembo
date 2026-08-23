import { handler, body } from "@/lib/api/handler";
import { requestOtp } from "@/lib/auth";

/**
 * POST /api/auth/otp/demande — §2.5.4 « Pas de mot de passe : OTP par SMS. »
 * En développement, le code est renvoyé pour que la démonstration soit jouable
 * sans passerelle SMS ; en production il ne sort jamais du canal SMS.
 */
export const POST = handler(async ({ request }) => {
  const { phone } = await body<{ phone: string }>(request);
  const { devCode } = await requestOtp(phone);
  return { envoye: true, codeDeveloppement: devCode };
});
