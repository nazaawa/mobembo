/**
 * Produit `src/lib/db/schema.sql` à partir du module canonique — livrable
 * « export du schéma » (§4.2), directement exécutable par un DBA.
 *
 *   npm run schema:export
 */
import fs from "node:fs";
import path from "node:path";
import { SCHEMA_SQL } from "../src/lib/db/schema";

const destination = path.join(process.cwd(), "src", "lib", "db", "schema.sql");
fs.writeFileSync(destination, SCHEMA_SQL);
console.log(`Schéma exporté : ${destination} (${SCHEMA_SQL.length} octets)`);
