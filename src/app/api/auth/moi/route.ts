import { handler } from "@/lib/api/handler";

/** GET /api/auth/moi — session courante, ou `null`. */
export const GET = handler(async ({ session }) => ({ session }));
