import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { SCHEMA_SQL } from "./schema";

/**
 * Connexion SQLite unique au processus.
 *
 * SQLite est retenu pour le pilote : la §5.2 exige qu'« un seul billet soit
 * émis » quand deux guichetiers cliquent le même siège au même instant. Le
 * verrou d'écriture global de SQLite associé à `IMMEDIATE` donne cette
 * garantie sans code distribué. Le passage à PostgreSQL ne touche que ce
 * fichier : tout le domaine s'exprime en SQL standard et en transactions.
 */

declare global {
  // Le rechargement à chaud de Next recrée les modules ; la connexion, non.
  var __mobemboDb: Database.Database | undefined;
}

const DB_PATH =
  process.env.MOBEMBO_DB_PATH ?? path.join(process.cwd(), "data", "mobembo.db");

function open(): Database.Database {
  if (DB_PATH !== ":memory:") {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  }
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  // Une transaction d'écriture attend le verrou plutôt que d'échouer : c'est la
  // contrepartie du test de charge « aucune double attribution » (§3.4).
  db.pragma("busy_timeout = 5000");
  db.exec(SCHEMA_SQL);
  return db;
}

export function getDb(): Database.Database {
  if (!globalThis.__mobemboDb) globalThis.__mobemboDb = open();
  return globalThis.__mobemboDb;
}

/**
 * Transaction d'écriture immédiate : le verrou est pris dès le BEGIN, pas au
 * premier write. Sans cela, deux lecteurs concurrents peuvent tous deux lire
 * « siège disponible » avant qu'un seul n'obtienne le droit d'écrire — et
 * l'autre échoue en SQLITE_BUSY au lieu de relire l'état à jour.
 */
export function tx<T>(fn: (db: Database.Database) => T): T {
  const db = getDb();
  const run = db.transaction(fn);
  return run.immediate(db);
}

export function closeDb(): void {
  globalThis.__mobemboDb?.close();
  globalThis.__mobemboDb = undefined;
}

/** Réinitialise entièrement la base — réservé aux tests et au seed. */
export function resetDb(): void {
  const db = getDb();
  const tables = db
    .prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`,
    )
    .all() as { name: string }[];
  db.pragma("foreign_keys = OFF");
  for (const { name } of tables) db.exec(`DELETE FROM "${name}"`);
  db.pragma("foreign_keys = ON");
}

/**
 * Garde-fou : un fichier de test qui oublierait de pointer sur `:memory:`
 * effacerait la base de développement — voire, un jour, une base réelle. La
 * détection se fait sur la présence du lanceur de tests de Node.
 */
export function assertBaseDeTest(): void {
  if (DB_PATH !== ":memory:") {
    throw new Error(
      `Les tests doivent tourner sur une base en mémoire (MOBEMBO_DB_PATH=:memory:), ` +
        `pas sur ${DB_PATH}. Lancez-les avec « npm test ».`,
    );
  }
}
