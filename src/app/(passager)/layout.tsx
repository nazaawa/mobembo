import Link from "next/link";
import { currentSession } from "@/lib/auth/session";
import { MobemboLogo } from "@/components/brand";

/**
 * PWA passager (§2.5). Coquille volontairement légère : §3.4 exige
 * « chargement PWA en 3G < 3 s pour l'écran de recherche ».
 */
export default async function PassagerLayout({ children }: LayoutProps<"/">) {
  const session = await currentSession();
  const passager = session?.activeRole === "PASSAGER" ? session : null;

  return (
    <div className="flex min-h-full flex-col bg-fond">
      <header className="sticky top-0 z-30 border-b border-bordure bg-surface/95 backdrop-blur-md">
        <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between gap-5 px-4 sm:px-6">
          <Link href="/" className="group flex items-center gap-3" aria-label="Mobembo, accueil">
            <MobemboLogo alt="" className="h-9 w-auto transition-transform duration-300 ease-depart group-hover:-translate-y-0.5 motion-reduce:transform-none motion-reduce:transition-none" />
          </Link>
          <nav className="flex items-center gap-2 text-sm sm:gap-7" aria-label="Navigation passager">
            <Link
              href="/"
              className="relative hidden font-medium text-navy after:absolute after:-bottom-1.5 after:left-0 after:h-[2px] after:w-0 after:rounded-full after:bg-accent after:transition-[width] after:duration-300 after:ease-depart hover:text-accent hover:after:w-full sm:block"
            >
              Accueil
            </Link>
            {passager ? (
              <>
                <Link
                  href="/mes-billets"
                  className="relative inline-flex min-h-11 items-center px-1 font-medium text-navy after:absolute after:-bottom-1 after:left-1 after:h-[2px] after:w-0 after:rounded-full after:bg-accent after:transition-[width] after:duration-300 after:ease-depart hover:text-accent hover:after:w-[calc(100%-0.5rem)]"
                >
                  Mes billets
                </Link>
                <span className="hidden items-center gap-1.5 rounded-md bg-surface-alt px-2.5 py-2 text-xs text-texte-doux md:inline-flex">
                  <span className="h-1.5 w-1.5 rounded-full bg-succes" aria-hidden />
                  {passager.phone}
                </span>
              </>
            ) : (
              <Link
                href="/mes-billets"
                className="inline-flex min-h-11 items-center rounded-[10px] border border-bordure px-3.5 font-semibold text-navy transition-colors duration-300 ease-depart hover:border-accent hover:text-accent"
              >
                Mes billets
              </Link>
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>

      <footer className="mt-12 bg-navy-profond text-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.5fr_1fr_1fr]">
          <div className="max-w-md">
            <p className="font-heading text-lg font-bold tracking-[-0.02em]">Mobembo</p>
            <p className="mt-3 text-sm leading-6 text-white/65">
              Le prix affiché en ligne n&apos;est jamais supérieur au prix au guichet. Aucune commission n&apos;est ajoutée au passager.
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/60">Votre voyage</p>
            <div className="mt-2 flex flex-col items-start text-sm text-white/75">
              <Link href="/" className="inline-flex min-h-11 items-center hover:text-white">Chercher un trajet</Link>
              <Link href="/mes-billets" className="inline-flex min-h-11 items-center hover:text-white">Retrouver mes billets</Link>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/60">Espaces professionnels</p>
            <div className="mt-2 flex flex-col items-start text-sm text-white/75">
              <Link href="/guichet" className="inline-flex min-h-11 items-center hover:text-white">Guichet</Link>
              <Link href="/backoffice" className="inline-flex min-h-11 items-center hover:text-white">Back-office</Link>
              <Link href="/controle" className="inline-flex min-h-11 items-center hover:text-white">Contrôleur</Link>
              <Link href="/api-doc" className="inline-flex min-h-11 items-center hover:text-white">API</Link>
            </div>
          </div>
        </div>
        <div className="border-t border-white/10 px-4 py-4 text-center text-[11px] text-white/60">
          Billetterie interurbaine pensée pour les routes de la RDC.
        </div>
      </footer>
    </div>
  );
}
