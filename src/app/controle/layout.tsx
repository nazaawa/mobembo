import Link from "next/link";
import { MobemboLogo } from "@/components/brand";

export const dynamic = "force-dynamic";

/**
 * App contrôleur (§2.7). Interface volontairement dense en contraste et en
 * taille : elle s'utilise debout, à la portière du bus, souvent en plein
 * soleil, avec le verdict lisible en une fraction de seconde.
 */
export default function ControleLayout({ children }: LayoutProps<"/controle">) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-bordure bg-surface">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-2.5">
          <Link href="/controle" className="flex min-h-11 items-center gap-2" aria-label="Mobembo Contrôleur">
            <MobemboLogo alt="" className="h-7 w-auto" />
            <span className="rounded bg-accent-doux px-1.5 py-0.5 text-[11px] font-medium text-accent">
              Contrôleur
            </span>
          </Link>
          <Link href="/guichet/connexion" className="text-xs text-accent hover:underline">
            Changer de rôle
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-5">{children}</main>
    </div>
  );
}
