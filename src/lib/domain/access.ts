import type { DbHandle } from "@/lib/db";
import { getDb, tx } from "@/lib/db";
import { errors } from "@/lib/core/errors";
import { audit } from "./audit";
import {
  MODULES_PAR_DEFAUT,
  MODULE_LABELS,
  parseModules,
  serialiseModules,
  type CompanyModule,
} from "./modules";

/**
 * Lecture et écriture des modules ouverts à une agence.
 *
 * Deux niveaux, volontairement distincts :
 *
 * - `modules` — ce que Mobembo a ouvert. Seul le super-administrateur y touche.
 *   C'est la garantie qu'une agence référencée hier ne se retrouve pas devant
 *   une caisse, un plan de sièges et une grille de renoncement.
 * - `advancedView` — ce que le directeur choisit d'afficher parmi ce qui est
 *   ouvert. Il peut replier son back-office sur l'essentiel sans rien perdre,
 *   et le rouvrir d'un clic.
 *
 * Le second ne peut jamais élargir le premier.
 */
export interface CompanyAccess {
  companyId: string;
  name: string;
  /** Modules ouverts par Mobembo. */
  modules: CompanyModule[];
  /** Choix d'affichage du directeur. */
  advancedView: boolean;
  /** Modules ouverts ET affichés — ce que la navigation doit montrer. */
  visible: CompanyModule[];
}

export async function companyAccess(
  companyId: string,
  db: DbHandle = getDb(),
): Promise<CompanyAccess> {
  const row = await db
    .prepare<{ id: string; name: string; modules: string | null; advanced_view: number }>(
      `SELECT id, name, modules, advanced_view FROM companies WHERE id = ?`,
    )
    .get(companyId);
  if (!row) throw errors.notFound("Agence");

  // Colonne jamais renseignée (compagnie créée avant la migration, ou insérée
  // hors des chemins applicatifs) : on retombe sur la dotation d'une agence
  // neuve plutôt que sur un back-office vide.
  const modules = row.modules === null ? MODULES_PAR_DEFAUT : parseModules(row.modules);
  const advancedView = row.advanced_view === 1;

  return {
    companyId: row.id,
    name: row.name,
    modules,
    advancedView,
    // La phase 2 reste visible même en vue simplifiée : c'est le socle du
    // produit, pas une fonction avancée.
    visible: advancedView ? modules : modules.filter((module) => module === "RESERVATION"),
  };
}

export function hasModule(access: CompanyAccess, module: CompanyModule): boolean {
  return access.modules.includes(module);
}

/** Module ouvert *et* affiché — le test que fait la navigation. */
export function showsModule(access: CompanyAccess, module: CompanyModule): boolean {
  return access.visible.includes(module);
}

/**
 * Garde d'écran. Elle protège d'un égarement, pas d'un attaquant : le contrôle
 * d'autorisation reste celui des rôles (§3.3). Un module fermé n'expose donc
 * pas de donnée d'une autre agence, il indique simplement que cette phase n'est
 * pas encore ouverte — et l'écran appelant le dit avec des mots utiles.
 */
export async function requireModule(
  companyId: string,
  module: CompanyModule,
  db: DbHandle = getDb(),
): Promise<CompanyAccess> {
  const access = await companyAccess(companyId, db);
  if (!hasModule(access, module)) {
    throw errors.forbidden(
      `Le module « ${MODULE_LABELS[module]} » n'est pas ouvert pour cette agence.`,
    );
  }
  return access;
}

/** Ouverture ou fermeture d'un module — réservé à l'équipe Mobembo. */
export async function setCompanyModules(params: {
  companyId: string;
  modules: CompanyModule[];
  actor: { userId: string; role: string };
}): Promise<CompanyAccess> {
  if (params.actor.role !== "SUPER_ADMIN") {
    throw errors.forbidden("Seule l'équipe Mobembo ouvre ou ferme un module.");
  }
  return tx(async (db) => {
    const avant = await companyAccess(params.companyId, db);
    await db
      .prepare(`UPDATE companies SET modules = ? WHERE id = ?`)
      .run(serialiseModules(params.modules), params.companyId);
    await audit(
      {
        userId: params.actor.userId,
        role: params.actor.role,
        companyId: params.companyId,
        action: "MODULES_AGENCE",
        entity: "company",
        entityId: params.companyId,
        before: { modules: avant.modules },
        after: { modules: serialiseModules(params.modules) },
      },
      db,
    );
    return companyAccess(params.companyId, db);
  });
}

/** Interrupteur d'affichage du directeur — n'ouvre aucun module. */
export async function setAdvancedView(params: {
  companyId: string;
  advancedView: boolean;
  actor: { userId: string; role: string };
}): Promise<CompanyAccess> {
  return tx(async (db) => {
    await db
      .prepare(`UPDATE companies SET advanced_view = ? WHERE id = ?`)
      .run(params.advancedView ? 1 : 0, params.companyId);
    await audit(
      {
        userId: params.actor.userId,
        role: params.actor.role,
        companyId: params.companyId,
        action: params.advancedView ? "VUE_COMPLETE" : "VUE_SIMPLIFIEE",
        entity: "company",
        entityId: params.companyId,
      },
      db,
    );
    return companyAccess(params.companyId, db);
  });
}
