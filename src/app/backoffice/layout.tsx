import Link from "next/link";
import { redirect } from "next/navigation";
import { currentSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { ROLE_LABELS } from "@/lib/domain/types";

export const dynamic = "force-dynamic";

const ONGLETS = [
  { href: "/backoffice", label: "Tableau de bord" },
  { href: "/backoffice/planification", label: "Planification" },
  { href: "/backoffice/referentiel", label: "Référentiel" },
  { href: "/backoffice/rapports", label: "Rapports" },
  { href: "/backoffice/reversements", label: "Reversements" },
  { href: "/backoffice/audit", label: "Journal d'audit" },
  { href: "/backoffice/utilisateurs", label: "Utilisateurs" },
  { href: "/backoffice/parametres", label: "Paramètres" },
] as const;

export default async function BackofficeLayout({ children }: LayoutProps<"/backoffice">) {
  const session = await currentSession();
  if (
    !session ||
    !["ADMIN_COMPAGNIE", "GERANT_AGENCE", "SUPER_ADMIN"].includes(session.activeRole)
  ) {
    redirect("/guichet/connexion");
  }

  const alertes = getDb()
    .prepare(
      `SELECT COUNT(*) AS n FROM alerts
        WHERE (company_id = ? OR company_id IS NULL) AND acknowledged_at IS NULL`,
    )
    .get(session.companyId) as { n: number };

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-bordure bg-surface">
        <div className="mx-auto max-w-7xl px-4">
          <div className="flex flex-wrap items-center justify-between gap-3 py-2.5">
            <Link href="/backoffice" className="flex items-baseline gap-2">
              <span className="text-base font-semibold tracking-tight">Mobembo</span>
              <span className="rounded bg-accent-doux px-1.5 py-0.5 text-[11px] font-medium text-accent">
                Back-office
              </span>
            </Link>
            <div className="flex items-center gap-3 text-sm">
              {alertes.n > 0 && (
                <span className="rounded-md border border-alerte/40 bg-alerte-doux px-2 py-0.5 text-xs font-medium text-alerte">
                  {alertes.n} alerte{alertes.n > 1 ? "s" : ""}
                </span>
              )}
              <span className="text-texte-doux">
                {session.name} · {ROLE_LABELS[session.activeRole]}
              </span>
              <Link href="/guichet/connexion" className="text-xs text-accent hover:underline">
                Changer de rôle
              </Link>
            </div>
          </div>

          <nav className="-mb-px flex gap-1 overflow-x-auto text-sm">
            {ONGLETS.map((onglet) => (
              <Link
                key={onglet.href}
                href={onglet.href}
                className="whitespace-nowrap border-b-2 border-transparent px-3 py-2 text-texte-doux transition hover:border-accent hover:text-texte"
              >
                {onglet.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5">{children}</main>
    </div>
  );
}
