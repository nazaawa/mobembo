import { handler } from "@/lib/api/handler";
import { knownCities } from "@/lib/domain/planning";

export const GET = handler(async () => ({ villes: knownCities() }));
