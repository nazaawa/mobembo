import { handler } from "@/lib/api/handler";
import { searchableCities } from "@/lib/domain/offers";

/**
 * Villes proposées à la recherche : celles des lignes complètes et celles des
 * horaires publiés en phase 1, réunies. Une ville desservie uniquement par une
 * agence non numérisée doit être cherchable comme les autres.
 */
export const GET = handler(async () => ({ villes: await searchableCities() }));
