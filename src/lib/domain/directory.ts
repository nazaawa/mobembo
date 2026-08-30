import type { DbHandle } from "@/lib/db";
import { getDb, tx } from "@/lib/db";
import { normalisePhone } from "@/lib/auth";
import { errors } from "@/lib/core/errors";
import { nowIso } from "@/lib/core/time";
import { audit } from "./audit";

export { whatsappLink, directionsLink } from "@/lib/core/links";
export { activiteAgence } from "./directory-format";

/**
 * Phase 1 — §4.4 « Fiche agence » et §5.3 « Gestion du profil ».
 *
 * L'annuaire est le premier service rendu : un voyageur doit pouvoir savoir
 * qui dessert sa destination, à quelle heure, à quel prix et comment joindre
 * l'agence — avant toute réservation et sans qu'aucune agence n'ait à
 * numériser sa billetterie. Le référencement est gratuit (§6) : une compagnie
 * est visible dès sa création.
 */

export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Slug libre le plus proche du nom, suffixé si la place est prise. */
export async function uniqueSlug(
  name: string,
  companyId: string,
  db: DbHandle = getDb(),
): Promise<string> {
  const base = slugify(name) || "agence";
  for (let attempt = 0; attempt < 50; attempt++) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const taken = await db
      .prepare<{ id: string }>(`SELECT id FROM companies WHERE slug = ? AND id <> ?`)
      .get(candidate, companyId);
    if (!taken) return candidate;
  }
  return `${base}-${companyId.slice(-6)}`;
}

export interface CompanyProfile {
  id: string;
  name: string;
  slug: string | null;
  kind: string;
  status: string;
  logo: string | null;
  description: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  head_office_city: string | null;
  address: string | null;
  services: string | null;
  listed: number;
  profile_updated_at: string | null;
  created_at: string;
}

export async function companyProfile(
  companyId: string,
  db: DbHandle = getDb(),
): Promise<CompanyProfile> {
  const row = await db
    .prepare<CompanyProfile>(
      `SELECT id, name, slug, kind, status, logo, description, phone, whatsapp, email,
              head_office_city, address, services, listed, profile_updated_at, created_at
         FROM companies WHERE id = ?`,
    )
    .get(companyId);
  if (!row) throw errors.notFound("Agence");
  return row;
}

export interface UpdateProfileInput {
  companyId: string;
  description?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  headOfficeCity?: string | null;
  address?: string | null;
  /** Services proposés, une ligne par service (§4.4). */
  services?: string | null;
  actor: { userId: string; role: string };
}

const trimmed = (value: string | null | undefined) => value?.trim() || null;

export async function updateCompanyProfile(input: UpdateProfileInput): Promise<CompanyProfile> {
  if (input.email && input.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email.trim())) {
    throw errors.invalid("Adresse e-mail invalide.");
  }
  return tx(async (db) => {
    const before = await companyProfile(input.companyId, db);
    const slug = before.slug ?? (await uniqueSlug(before.name, before.id, db));
    const phone = input.phone?.trim() ? normalisePhone(input.phone) : null;
    const whatsapp = input.whatsapp?.trim() ? normalisePhone(input.whatsapp) : null;
    await db
      .prepare(
        `UPDATE companies SET slug = ?, description = ?, phone = ?, whatsapp = ?, email = ?,
                head_office_city = ?, address = ?, services = ?, profile_updated_at = ?
          WHERE id = ?`,
      )
      .run(
        slug,
        trimmed(input.description),
        phone,
        whatsapp,
        trimmed(input.email),
        trimmed(input.headOfficeCity),
        trimmed(input.address),
        trimmed(input.services),
        nowIso(),
        input.companyId,
      );
    await audit(
      {
        userId: input.actor.userId,
        role: input.actor.role,
        companyId: input.companyId,
        action: "MISE_A_JOUR_FICHE_AGENCE",
        entity: "company",
        entityId: input.companyId,
        before: { telephone: before.phone, whatsapp: before.whatsapp, adresse: before.address },
        after: { telephone: phone, whatsapp, adresse: trimmed(input.address) },
      },
      db,
    );
    return companyProfile(input.companyId, db);
  });
}

/** §2.5 Administration : retirer une agence de l'annuaire sans la supprimer. */
export async function setCompanyListed(params: {
  companyId: string;
  listed: boolean;
  actor: { userId: string; role: string };
}): Promise<void> {
  await tx(async (db) => {
    await db
      .prepare(`UPDATE companies SET listed = ? WHERE id = ?`)
      .run(params.listed ? 1 : 0, params.companyId);
    await audit(
      {
        userId: params.actor.userId,
        role: params.actor.role,
        companyId: params.companyId,
        action: params.listed ? "REFERENCEMENT_AGENCE" : "RETRAIT_ANNUAIRE",
        entity: "company",
        entityId: params.companyId,
      },
      db,
    );
  });
}

export interface DirectoryEntry {
  id: string;
  name: string;
  slug: string | null;
  kind: string;
  logo: string | null;
  description: string | null;
  phone: string | null;
  whatsapp: string | null;
  head_office_city: string | null;
  villes: string | null;
  /** Services réguliers publiés (phase 1). */
  horaires: number;
  /** Départs datés à venir, pour une agence déjà passée à la billetterie complète. */
  departsPlanifies: number;
  reservationEnLigne: number;
  derniereMiseAJour: string | null;
}


/**
 * Annuaire public. Une agence y figure dès qu'elle est active et référencée,
 * même sans un seul horaire publié : le voyageur peut alors la joindre
 * directement, ce qui reste plus utile qu'une absence.
 */
export async function publicDirectory(db: DbHandle = getDb()): Promise<DirectoryEntry[]> {
  return db
    .prepare<DirectoryEntry>(
      `SELECT c.id, c.name, c.slug, c.kind, c.logo, c.description, c.phone, c.whatsapp,
              c.head_office_city,
              (SELECT GROUP_CONCAT(DISTINCT v.city ORDER BY v.city SEPARATOR ', ') FROM (
                  SELECT s.company_id, s.origin_city AS city FROM schedules s WHERE s.status = 'PUBLIE'
                  UNION
                  SELECT s.company_id, s.destination_city FROM schedules s WHERE s.status = 'PUBLIE'
                  UNION
                  SELECT r.company_id, r.origin_city FROM routes r
                  UNION
                  SELECT r.company_id, r.destination_city FROM routes r
                ) v WHERE v.company_id = c.id) AS villes,
              (SELECT COUNT(*) FROM schedules s WHERE s.company_id = c.id AND s.status = 'PUBLIE') AS horaires,
              (SELECT COUNT(*) FROM trips t
                WHERE t.company_id = c.id AND t.status IN ('PLANIFIE','EN_VENTE')
                  AND t.departure_mode = 'HORAIRE_FIXE'
                  AND t.departure_datetime >= ?) AS departsPlanifies,
              (SELECT COUNT(*) FROM schedules s
                WHERE s.company_id = c.id AND s.status = 'PUBLIE' AND s.booking_enabled = 1) AS reservationEnLigne,
              GREATEST(
                COALESCE(c.profile_updated_at, c.created_at),
                COALESCE((SELECT MAX(s.updated_at) FROM schedules s WHERE s.company_id = c.id), c.created_at)
              ) AS derniereMiseAJour
         FROM companies c
        WHERE c.status = 'ACTIVE' AND c.listed = 1
        ORDER BY horaires DESC, departsPlanifies DESC, c.name`,
    )
    .all(nowIso());
}

export interface AgencyPoint {
  id: string;
  name: string;
  city: string;
  address: string | null;
  gps: string | null;
  opening_hours: string | null;
}

export interface PublicAgencyPage {
  compagnie: CompanyProfile;
  /** §4.4 : « adresse » — les points de vente physiques de la compagnie. */
  points: AgencyPoint[];
  villes: string[];
  derniereMiseAJour: string;
}

export async function publicAgencyBySlug(
  slug: string,
  db: DbHandle = getDb(),
): Promise<PublicAgencyPage | null> {
  const company = await db
    .prepare<CompanyProfile>(
      `SELECT id, name, slug, kind, status, logo, description, phone, whatsapp, email,
              head_office_city, address, services, listed, profile_updated_at, created_at
         FROM companies WHERE (slug = ? OR id = ?) AND status = 'ACTIVE' AND listed = 1`,
    )
    .get(slug, slug);
  if (!company) return null;

  const points = await db
    .prepare<AgencyPoint>(
      `SELECT id, name, city, address, gps, opening_hours FROM agencies
        WHERE company_id = ? AND status = 'ACTIVE' ORDER BY city, name`,
    )
    .all(company.id);

  const villesRows = await db
    .prepare<{ city: string }>(
      `SELECT origin_city AS city FROM schedules WHERE company_id = ? AND status = 'PUBLIE'
       UNION SELECT destination_city FROM schedules WHERE company_id = ? AND status = 'PUBLIE'
       UNION SELECT origin_city FROM routes WHERE company_id = ?
       UNION SELECT destination_city FROM routes WHERE company_id = ?
       ORDER BY city`,
    )
    .all(company.id, company.id, company.id, company.id);

  const majRow = await db
    .prepare<{ maj: string | null }>(
      `SELECT MAX(updated_at) AS maj FROM schedules WHERE company_id = ?`,
    )
    .get(company.id);

  const candidates = [company.profile_updated_at, majRow?.maj, company.created_at].filter(
    (value): value is string => Boolean(value),
  );

  return {
    compagnie: company,
    points,
    villes: villesRows.map((row) => row.city),
    derniereMiseAJour: candidates.sort().at(-1)!,
  };
}
