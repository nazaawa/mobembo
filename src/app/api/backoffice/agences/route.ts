import { authed, body } from "@/lib/api/handler";
import { getDb, tx } from "@/lib/db";
import { newId } from "@/lib/core/ids";
import { nowIso } from "@/lib/core/time";
import { errors } from "@/lib/core/errors";
import { audit } from "@/lib/domain/audit";
import { detectSequenceGaps } from "@/lib/domain/tickets";

export const GET = authed(
  ["ADMIN_COMPAGNIE", "GERANT_AGENCE", "SUPER_ADMIN"],
  async ({ session }) => {
    const agences = (await getDb()
      .prepare(`SELECT * FROM agencies WHERE company_id = ? AND (? IS NULL OR id = ?) ORDER BY name`)
      .all(
        session.companyId,
        session.activeRole === "GERANT_AGENCE" ? session.agencyId : null,
        session.activeRole === "GERANT_AGENCE" ? session.agencyId : null,
      )) as Array<{ id: string; name: string }>;
    return {
      agences: await Promise.all(
        agences.map(async (agence) => ({
          ...agence,
          // §2.4 : la continuité de la séquence est vérifiée à chaque consultation.
          sequence: await detectSequenceGaps(agence.id),
        })),
      ),
    };
  },
);

export const POST = authed(["ADMIN_COMPAGNIE", "SUPER_ADMIN"], async ({ request, session }) => {
  if (!session.companyId) throw errors.invalid("Compagnie non déterminée.");
  const input = await body<{
    nom: string;
    ville: string;
    adresse?: string;
    horaires?: string;
  }>(request);

  return tx(async (db) => {
    const id = newId("agc");
    await db
      .prepare(
        `INSERT INTO agencies
         (id, company_id, name, city, address, gps, opening_hours, status, ticket_sequence, created_at)
       VALUES (?, ?, ?, ?, ?, NULL, ?, 'ACTIVE', 0, ?)`,
      )
      .run(
        id,
        session.companyId,
        input.nom,
        input.ville,
        input.adresse ?? null,
        input.horaires ?? null,
        nowIso(),
      );
    await audit(
      {
        userId: session.userId,
        role: session.activeRole,
        companyId: session.companyId,
        action: "CREATION_AGENCE",
        entity: "agency",
        entityId: id,
        after: input,
      },
      db,
    );
    return { agence: await db.prepare(`SELECT * FROM agencies WHERE id = ?`).get(id) };
  });
});
