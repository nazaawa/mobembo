import test, { after } from "node:test";
import assert from "node:assert/strict";
import { closeDb, getDb } from "@/lib/db";
import { DomainError } from "@/lib/core/errors";
import { toMinor } from "@/lib/core/money";
import { companyScope, type Session } from "@/lib/auth/session";
import { createStaffUser } from "@/lib/auth";
import { openCashSession } from "@/lib/domain/cash";
import { posSell } from "@/lib/domain/bookings";
import { createPartnerApplication, reviewPartnerApplication } from "@/lib/domain/partners";
import { seedFixture, seatsOfChannel } from "./helpers";

after(async () => closeDb());

function session(role: Session["activeRole"], companyId: string | null, agencyId: string | null = null): Session {
  return { id: "ses_test", userId: "usr_test", name: "Test", phone: "+243800000000", activeRole: role, companyId, agencyId, availableRoles: [] };
}

test("RBAC — une direction ne peut pas remplacer sa compagnie par un paramètre", () => {
  assert.equal(companyScope(session("ADMIN_COMPAGNIE", "cmp_a")), "cmp_a");
  assert.throws(
    () => companyScope(session("ADMIN_COMPAGNIE", "cmp_a"), "cmp_b"),
    (error: unknown) => error instanceof DomainError && error.code === "INTERDIT",
  );
  assert.equal(companyScope(session("SUPER_ADMIN", null), "cmp_b"), "cmp_b");
});

test("RBAC — un guichet ne vend pas un départ d'une autre agence", async () => {
  const fixture = await seedFixture();
  const [seat] = await seatsOfChannel(fixture.tripId, "GUICHET", 1);
  const cash = await openCashSession({ agencyId: fixture.agency2Id, userId: fixture.guichetierId, openingFloat: toMinor(20), currency: "USD", actorRole: "GUICHETIER" });
  await assert.rejects(
    () => posSell({
      tripId: fixture.tripId,
      seatNumbers: [seat],
      passengers: [{ seatNumber: seat, name: "Passager" }],
      buyerPhone: "+243811111111",
      buyerName: "Passager",
      cashSessionId: cash.id,
      currency: "USD",
      actor: { userId: fixture.guichetierId, role: "GUICHETIER", companyId: fixture.companyId, agencyId: fixture.agency2Id },
    }),
    (error: unknown) => error instanceof DomainError && error.code === "INTERDIT",
  );
});

test("RBAC — la création staff ne peut pas reprendre le compte d'un utilisateur existant", async () => {
  const fixture = await seedFixture();
  const existingPhone = "+243899333444";
  await getDb().prepare(`UPDATE users SET phone = ? WHERE id = ?`).run(existingPhone, fixture.controleurId);
  await assert.rejects(
    () => createStaffUser({
      phone: existingPhone,
      name: "Compte détourné",
      password: "nouveau-secret",
      roles: [{ role: "SUPER_ADMIN", companyId: null, agencyId: null }],
      actor: { userId: fixture.gerantId, role: "ADMIN_COMPAGNIE", companyId: fixture.companyId },
    }),
    (error: unknown) => error instanceof DomainError && error.code === "UTILISATEUR_EXISTANT",
  );
});

test("Onboarding — l'approbation crée une compagnie, une agence et sa direction", async () => {
  const fixture = await seedFixture();
  const application = await createPartnerApplication({
    companyName: "Trans Kongo",
    contactName: "Amina K.",
    phone: "+243899111222",
    email: "amina@example.com",
    city: "Kikwit",
    agencyName: "Agence Kikwit Centre",
    destinations: "Kinshasa, Kenge",
    fleetSize: 4,
  });
  const result = await reviewPartnerApplication({
    applicationId: application.id,
    decision: "APPROUVER",
    initialPassword: "initial-2026",
    actor: { userId: fixture.gerantId, role: "SUPER_ADMIN" },
  });
  assert.ok(result.companyId);
  const db = getDb();
  const company = await db.prepare<{ name: string }>(`SELECT name FROM companies WHERE id = ?`).get(result.companyId);
  const agency = await db.prepare<{ n: number }>(`SELECT COUNT(*) AS n FROM agencies WHERE company_id = ?`).get(result.companyId);
  const direction = await db.prepare<{ role: string }>(`SELECT ur.role FROM user_roles ur JOIN users u ON u.id = ur.user_id WHERE u.phone = ? AND ur.company_id = ?`).get("+243899111222", result.companyId);
  assert.equal(company?.name, "Trans Kongo");
  assert.equal(agency?.n, 1);
  assert.equal(direction?.role, "ADMIN_COMPAGNIE");
});
