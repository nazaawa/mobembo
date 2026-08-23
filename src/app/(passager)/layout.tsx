import Link from "next/link";
import { currentSession } from "@/lib/auth/session";

/**
 * PWA passager (§2.5). Coquille volontairement légère : §3.4 exige
 * « chargement PWA en 3G < 3 s pour l'écran de recherche ».
 */
export default async function PassagerLayout({ children }: LayoutProps<"/">) {
  const session = await currentSession();
  const passager = session?.activeRole === "PASSAGER" ? session : null;

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-10 border-b border-bordure bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" className="flex items-baseline gap-2">
            <span className="text-base font-semibold tracking-tight">Mobembo</span>
            <span className="text-[11px] text-texte-doux">billetterie bus · RDC</span>
          </Link>
          <nav className="flex items-center gap-3 text-sm">
            {passager ? (
              <>
                <Link href="/mes-billets" className="hover:text-accent">
                  Mes billets
                </Link>
                <span className="text-xs text-texte-doux">{passager.phone}</span>
              </>
            ) : (
              <Link href="/mes-billets" className="hover:text-accent">
                Mes billets
              </Link>
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">{children}</main>

      <footer className="border-t border-bordure px-4 py-5 text-center text-[11px] text-texte-doux">
        <p>
          Le prix affiché en ligne n&apos;est jamais supérieur au prix au guichet. Aucune
          commission n&apos;est ajoutée au passager.
        </p>
        <p className="mt-1.5">
          <Link href="/guichet" className="hover:text-accent">
            Espace guichet
          </Link>
          {" · "}
          <Link href="/backoffice" className="hover:text-accent">
            Back-office
          </Link>
          {" · "}
          <Link href="/controle" className="hover:text-accent">
            Contrôleur
          </Link>
          {" · "}
          <Link href="/api-doc" className="hover:text-accent">
            API
          </Link>
        </p>
      </footer>
    </div>
  );
}
