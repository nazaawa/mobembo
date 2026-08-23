import Link from "next/link";
import { currentSession } from "@/lib/auth/session";
import { ROLE_LABELS } from "@/lib/domain/types";
import { BarreEtat } from "./barre-etat";
import { MobemboLogo } from "@/components/brand";

export const dynamic = "force-dynamic";

/**
 * Coquille du POS guichet (§2.4). « Le module guichet n'est pas un accessoire,
 * c'est le cœur du système. »
 */
export default async function GuichetLayout({ children }: LayoutProps<"/guichet">) {
  const session = await currentSession();
  const connecte = session && ["GUICHETIER", "GERANT_AGENCE"].includes(session.activeRole);

  return (
    <div className="flex min-h-full flex-col">
      <header className="sans-impression border-b border-bordure bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-2.5">
          <Link href="/guichet" className="flex min-h-11 items-center gap-2" aria-label="Mobembo Guichet">
            <MobemboLogo alt="" className="h-7 w-auto" />
            <span className="rounded bg-accent-doux px-1.5 py-0.5 text-[11px] font-medium text-accent">
              Guichet
            </span>
          </Link>

          {connecte && (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <BarreEtat />
              <span className="text-texte-doux">
                {session.name} · {ROLE_LABELS[session.activeRole]}
              </span>
              <form action="/api/auth/deconnexion" method="post">
                <Link href="/guichet/connexion" className="text-xs text-accent hover:underline">
                  Changer de rôle
                </Link>
              </form>
            </div>
          )}
        </div>
      </header>

      <main className="zone-impression mx-auto w-full max-w-6xl flex-1 px-4 py-5">
        {children}
      </main>
    </div>
  );
}
