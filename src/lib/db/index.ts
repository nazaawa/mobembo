import mysql from "mysql2/promise";
import { SCHEMA_SQL } from "./schema";

/**
 * Connexion MySQL unique au processus (pool).
 *
 * §5.2 exige qu'« un seul billet soit émis » quand deux guichetiers cliquent
 * le même siège au même instant. Sous SQLite, le verrou d'écriture global
 * donnait cette garantie gratuitement. Sous MySQL, elle repose sur le
 * verrouillage de ligne `SELECT ... FOR UPDATE` pris à l'intérieur de `tx()`
 * — voir `src/lib/domain/seats.ts` pour l'endroit où cela compte vraiment.
 *
 * Forme des appels conservée à l'identique de better-sqlite3 :
 * `getDb().prepare(sql).get/all/run(...params)`, mais désormais asynchrones
 * (MySQL n'a pas d'équivalent synchrone). `getDb()` reste, elle, synchrone :
 * la migration du schéma est attendue paresseusement au premier `get/all/run`
 * plutôt qu'à l'obtention du handle, pour ne pas changer la forme des
 * innombrables `const db = getDb();` déjà présents dans le domaine.
 */

type Executor = Pick<mysql.Pool | mysql.PoolConnection, "execute">;

export interface Stmt<T = Record<string, unknown>> {
  get(...params: unknown[]): Promise<T | undefined>;
  all(...params: unknown[]): Promise<T[]>;
  run(...params: unknown[]): Promise<{ changes: number; lastInsertRowid: number }>;
}

export interface DbHandle {
  prepare<T = Record<string, unknown>>(sql: string): Stmt<T>;
}

declare global {
  // Le rechargement à chaud de Next recrée les modules ; le pool, non.
  var __mobemboPool: mysql.Pool | undefined;
  var __mobemboMigrated: Promise<void> | undefined;
}

function connectionUrl(): string {
  const url = process.env.MOBEMBO_DATABASE_URL;
  if (!url) {
    throw new Error(
      "MOBEMBO_DATABASE_URL est requis (mysql://utilisateur:motdepasse@hote:port/base). " +
        "Voir .env.example.",
    );
  }
  return url;
}

function poolConfig(): mysql.PoolOptions {
  const parsed = new URL(connectionUrl());
  const sslMode = parsed.searchParams.get("ssl-mode");
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 3306,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: parsed.pathname.replace(/^\//, ""),
    ssl: sslMode && sslMode.toUpperCase() !== "DISABLED" ? { rejectUnauthorized: false } : undefined,
    connectionLimit: Number(process.env.MOBEMBO_DB_POOL_SIZE ?? 10),
    waitForConnections: true,
    // MySQL type SUM(colonne_entiere) en DECIMAL (protection contre le
    // dépassement) : sans ce réglage, mysql2 renvoie ces agrégats comme des
    // chaînes ("5000" au lieu de 5000), et une addition en JS les concatène
    // au lieu de les sommer. §5.1 : les montants doivent rester des entiers.
    decimalNumbers: true,
  };
}

/**
 * CREATE INDEX n'a pas de variante IF NOT EXISTS en MySQL : au redémarrage,
 * l'index existe déjà et le serveur renvoie ER_DUP_KEYNAME (1061), qu'on
 * ignore volontairement. CREATE TABLE, lui, garde son IF NOT EXISTS natif.
 * Même principe pour les ALTER TABLE ADD COLUMN additifs en fin de schéma :
 * sur une base où la colonne existe déjà (table neuve, ou migration déjà
 * appliquée), MySQL renvoie ER_DUP_FIELDNAME (1060), ignoré de la même façon.
 */
const IGNORABLE_MIGRATION_CODES = new Set(["ER_DUP_KEYNAME", "ER_DUP_FIELDNAME"]);

async function migrate(target: mysql.Pool): Promise<void> {
  const statements = SCHEMA_SQL.split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
  for (const statement of statements) {
    try {
      await target.query(statement);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code && IGNORABLE_MIGRATION_CODES.has(code)) continue;
      throw err;
    }
  }
}

function pool(): mysql.Pool {
  if (!globalThis.__mobemboPool) {
    const created = mysql.createPool(poolConfig());
    globalThis.__mobemboPool = created;
    globalThis.__mobemboMigrated = migrate(created);
  }
  return globalThis.__mobemboPool;
}

function migrated(): Promise<void> {
  pool();
  return globalThis.__mobemboMigrated!;
}

function makeHandle(executor: Executor): DbHandle {
  return {
    prepare<T>(sql: string): Stmt<T> {
      return {
        async get(...params) {
          await migrated();
          const [rows] = await executor.execute(sql, params as unknown[] as mysql.ExecuteValues);
          return (rows as T[])[0];
        },
        async all(...params) {
          await migrated();
          const [rows] = await executor.execute(sql, params as unknown[] as mysql.ExecuteValues);
          return rows as T[];
        },
        async run(...params) {
          await migrated();
          const [result] = await executor.execute(sql, params as unknown[] as mysql.ExecuteValues);
          const header = result as mysql.ResultSetHeader;
          return { changes: header.affectedRows, lastInsertRowid: header.insertId };
        },
      };
    },
  };
}

export function getDb(): DbHandle {
  return makeHandle(pool());
}

/**
 * Transaction avec verrouillage de lignes. Le connecteur est extrait du pool
 * pour toute la durée de la transaction : toutes les requêtes passées à `fn`
 * via le `DbHandle` fourni s'exécutent sur la même session, donc dans la même
 * transaction et sous les mêmes verrous `FOR UPDATE`.
 */
export async function tx<T>(fn: (db: DbHandle) => Promise<T>): Promise<T> {
  await migrated();
  const connection = await pool().getConnection();
  try {
    await connection.beginTransaction();
    const result = await fn(makeHandle(connection));
    await connection.commit();
    return result;
  } catch (err) {
    await connection.rollback().catch(() => {});
    throw err;
  } finally {
    connection.release();
  }
}

export async function closeDb(): Promise<void> {
  if (globalThis.__mobemboPool) {
    await globalThis.__mobemboPool.end();
    globalThis.__mobemboPool = undefined;
    globalThis.__mobemboMigrated = undefined;
  }
}

/** Réinitialise entièrement la base — réservé aux tests et au seed. */
export async function resetDb(): Promise<void> {
  await migrated();
  const p = pool();
  const [rows] = await p.query<mysql.RowDataPacket[]>(
    `SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()`,
  );
  await p.query("SET FOREIGN_KEY_CHECKS = 0");
  for (const { name } of rows as { name: string }[]) {
    await p.query(`TRUNCATE TABLE \`${name}\``);
  }
  await p.query("SET FOREIGN_KEY_CHECKS = 1");
}

/**
 * Garde-fou : un fichier de test qui pointerait par erreur sur la base de
 * développement ou de production l'effacerait entièrement au premier
 * `resetDb()`. La détection porte sur le nom de la base, qui doit se
 * terminer par `_test` (convention : `mobembo_test`, jamais `mobembo`/
 * `mobembo_dev`).
 */
export function assertBaseDeTest(): void {
  const url = process.env.MOBEMBO_DATABASE_URL ?? "";
  let dbName = "";
  try {
    dbName = new URL(url).pathname.replace(/^\//, "");
  } catch {
    // url absent ou invalide : dbName reste vide, l'erreur ci-dessous le couvre
  }
  if (!dbName.endsWith("_test")) {
    throw new Error(
      `Les tests doivent tourner sur une base dont le nom se termine par _test, ` +
        `pas sur "${dbName || url}". Lancez-les avec « npm test ».`,
    );
  }
}
