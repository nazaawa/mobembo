import Link from "next/link";
import { redirect } from "next/navigation";
import { currentSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { ROLE_LABELS } from "@/lib/domain/types";
import { companyAccess, showsModule } from "@/lib/domain/access";
import type { CompanyModule } from "@/lib/domain/modules";
import { MobemboLogo } from "@/components/brand";
import { BackofficeNavigation } from "./navigation";

export const dynamic = "force-dynamic";

type Item = {
  href: string;
  label: string;
  icon: string;
  /** Module requis. Absent = socle phase 1, toujours visible. */
  module?: CompanyModule;
  /** Rôles autorisés. Absent = tous les rôles du back-office. */
  roles?: string[];
};

/**
 * Navigation par phase, pas par exhaustivité.
 *
 * §29 : « Les fonctions affichées dépendent du rôle et de la phase activée pour
 * l'agence. » Une agence référencée hier voit quatre entrées ; elle en verra
 * douze le jour où elle aura demandé les phases correspondantes. Une entrée
 * n'apparaît jamais « grisée » : un menu plein de portes fermées apprend à
 * ignorer le menu.
 */
const GROUPES: ReadonlyArray<{ label: string; items: ReadonlyArray<Item> }> = [
  {
    label: "Ma présence Mobembo",
    items: [
      { href: "/backoffice", label: "Tableau de bord", icon: "grid" },
      { href: "/backoffice/horaires", label: "Trajets publiés", icon: "calendar" },
      { href: "/backoffice/reservations", label: "Réservations", icon: "users", module: "RESERVATION" },
      { href: "/backoffice/billets", label: "Paiements et billets", icon: "wallet", module: "PAIEMENT" },
      { href: "/backoffice/vitrine", label: "Fiche publique", icon: "pin" },
    ],
  },
  {
    label: "Exploitation",
    items: [
      { href: "/backoffice/planification", label: "Planification", icon: "calendar", module: "ERP" },
      { href: "/backoffice/referentiel", label: "Référentiel", icon: "bus", module: "ERP" },
    ],
  },
  {
    label: "Finances",
    items: [
      { href: "/backoffice/rapports", label: "Rapports", icon: "chart", module: "ERP", roles: ["ADMIN_COMPAGNIE", "SUPER_ADMIN"] },
      { href: "/backoffice/reversements", label: "Reversements", icon: "wallet", module: "PAIEMENT", roles: ["ADMIN_COMPAGNIE", "SUPER_ADMIN"] },
    ],
  },
  {
    label: "Gouvernance",
    items: [
      // §5.2 « Gestion des utilisateurs de l'agence » est une fonction de la
      // phase 1 : un responsable délègue la mise à jour de ses horaires dès le
      // premier jour.
      { href: "/backoffice/utilisateurs", label: "Utilisateurs", icon: "users", roles: ["ADMIN_COMPAGNIE", "SUPER_ADMIN"] },
      { href: "/backoffice/audit", label: "Journal d'audit", icon: "journal", module: "ERP", roles: ["ADMIN_COMPAGNIE", "SUPER_ADMIN"] },
      // Les paramètres restent toujours accessibles au directeur : c'est là que
      // vit l'interrupteur de vue, et un écran qui se cacherait lui-même serait
      // impossible à rouvrir.
      { href: "/backoffice/parametres", label: "Paramètres", icon: "settings", roles: ["ADMIN_COMPAGNIE", "SUPER_ADMIN"] },
    ],
  },
] as const;

export default async function BackofficeLayout({ children }: LayoutProps<"/backoffice">) {
  const session = await currentSession();
  if (!session || !["ADMIN_COMPAGNIE", "GERANT_AGENCE", "SUPER_ADMIN"].includes(session.activeRole)) {
    redirect("/guichet/connexion");
  }
  if (session.activeRole === "SUPER_ADMIN" && !session.companyId) redirect("/administration");

  const acces = await companyAccess(session.companyId!);

  const groupes = GROUPES.map((group) => ({
    label: group.label,
    items: group.items.filter(
      (item) =>
        (!item.module || showsModule(acces, item.module)) &&
        (!item.roles || item.roles.includes(session.activeRole)),
    ),
  })).filter((group) => group.items.length > 0);

  // Un module ouvert par Mobembo mais masqué par la vue simplifiée serait un
  // cadeau invisible : le directeur est prévenu, une fois, là où il regarde.
  const masques = acces.modules.filter((module) => !acces.visible.includes(module));

  const alertes = (await getDb()
    .prepare(
      `SELECT COUNT(*) AS n FROM alerts
      WHERE (company_id = ? OR company_id IS NULL)
        AND (? IS NULL OR agency_id IS NULL OR agency_id = ?)
        AND acknowledged_at IS NULL`,
    )
    .get(
      session.companyId,
      session.activeRole === "GERANT_AGENCE" ? session.agencyId : null,
      session.activeRole === "GERANT_AGENCE" ? session.agencyId : null,
    )) as { n: number };

  return (
    <div className="min-h-full bg-fond lg:grid lg:grid-cols-[16.5rem_minmax(0,1fr)]">
      <aside className="hidden border-r border-bordure bg-navy text-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
        <Link href="/backoffice" className="flex min-h-20 items-center border-b border-white/10 px-6" aria-label="Mobembo Back-office">
          <span className="rounded-[10px] bg-white px-3 py-2"><MobemboLogo alt="" className="h-7 w-auto" /></span>
        </Link>
        <div className="px-5 pt-5">
          <span className="inline-flex rounded-md bg-white/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-white/75">
            {acces.advancedView ? "Back-office" : "Vue simplifiée"}
          </span>
        </div>
        <BackofficeNavigation groups={groupes} />
        <div className="mt-auto border-t border-white/10 p-5">
          <p className="truncate text-sm font-semibold">{session.name}</p>
          <p className="mt-0.5 text-xs text-white/55">{ROLE_LABELS[session.activeRole]}</p>
          <Link href="/guichet/connexion" className="mt-3 inline-flex min-h-11 items-center text-xs font-semibold text-accent-clair hover:text-white">Changer de rôle</Link>
          {session.activeRole === "SUPER_ADMIN" && <Link href="/administration" className="block min-h-11 text-xs font-semibold text-white/70 hover:text-white">Changer de compagnie</Link>}
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 border-b border-bordure bg-surface/95 backdrop-blur-sm">
          <div className="flex min-h-16 items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
            <Link href="/backoffice" className="flex items-center gap-2 lg:hidden" aria-label="Mobembo Back-office">
              <MobemboLogo alt="" className="h-7 w-auto" />
              <span className="rounded bg-accent-doux px-1.5 py-0.5 text-[10px] font-bold text-accent">Admin</span>
            </Link>
            <div className="hidden lg:block">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-texte-doux">Espace agence</p>
              <p className="text-sm font-semibold text-navy">{acces.name}</p>
            </div>
            <div className="flex items-center gap-3">
              {alertes.n > 0 && (
                <Link href="/backoffice" className="inline-flex min-h-11 items-center gap-2 rounded-[10px] border border-alerte/25 bg-alerte-doux px-3 text-xs font-semibold text-alerte">
                  <span className="h-2 w-2 rounded-full bg-alerte" aria-hidden />
                  {alertes.n} alerte{alertes.n > 1 ? "s" : ""}
                </Link>
              )}
              <div className="hidden text-right sm:block lg:hidden">
                <p className="text-xs font-semibold">{session.name}</p>
                <p className="text-[11px] text-texte-doux">{ROLE_LABELS[session.activeRole]}</p>
              </div>
            </div>
          </div>
          <div className="border-t border-bordure px-4 lg:hidden"><BackofficeNavigation groups={groupes} mobile /></div>
        </header>
        <main className="mx-auto w-full max-w-[96rem] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {masques.length > 0 && session.activeRole === "ADMIN_COMPAGNIE" && (
            <p className="mb-5 rounded-lg border border-accent/25 bg-accent-doux px-4 py-3 text-sm leading-6 text-texte">
              <strong className="font-semibold text-navy">
                {masques.length} module{masques.length > 1 ? "s" : ""} ouvert
                {masques.length > 1 ? "s" : ""} par Mobembo, mais masqué
                {masques.length > 1 ? "s" : ""} par votre vue simplifiée.
              </strong>{" "}
              <Link href="/backoffice/parametres" className="font-semibold text-accent underline">
                Afficher la vue complète
              </Link>
            </p>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
