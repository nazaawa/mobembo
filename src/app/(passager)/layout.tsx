import Link from "next/link";
import { currentSession } from "@/lib/auth/session";
import { PassengerHeader } from "./passenger-header";

/**
 * PWA passager (§2.5). Coquille volontairement légère : §3.4 exige
 * « chargement PWA en 3G < 3 s pour l'écran de recherche ».
 */
export default async function PassagerLayout({ children }: LayoutProps<"/">) {
  const session = await currentSession();
  const passager = session?.activeRole === "PASSAGER" ? session : null;

  return (
    <div className="flex min-h-full flex-col bg-fond">
      <a href="#contenu-principal" className="fixed left-4 top-3 z-50 -translate-y-20 rounded-[10px] bg-navy px-4 py-3 text-sm font-bold text-white transition-transform focus:translate-y-0">
        Aller au contenu
      </a>
      <PassengerHeader authenticated={Boolean(passager)} />

      <main id="contenu-principal" tabIndex={-1} className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>

      <footer className="mt-12 bg-navy-profond text-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.5fr_1fr_1fr]">
          <div className="max-w-md">
            <p className="font-heading text-lg font-bold tracking-[-0.02em]">Mobembo</p>
            <p className="mt-3 text-sm leading-6 text-white/65">
              Les horaires, tarifs et contacts sont publiés par les agences elles-mêmes et affichent leur date de mise à jour. Le référencement est gratuit, et aucune commission n&apos;est ajoutée au voyageur.
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/60">Votre voyage</p>
            <div className="mt-2 flex flex-col items-start text-sm text-white/75">
              <Link href="/" className="inline-flex min-h-11 items-center hover:text-white">Chercher un trajet</Link>
              <Link href="/agences" className="inline-flex min-h-11 items-center hover:text-white">Les agences référencées</Link>
              <Link href="/mes-reservations" className="inline-flex min-h-11 items-center hover:text-white">Mes réservations</Link>
              <Link href="/mes-billets" className="inline-flex min-h-11 items-center hover:text-white">Mes billets payés</Link>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/60">Espaces professionnels</p>
            <div className="mt-2 flex flex-col items-start text-sm text-white/75">
              <Link href="/partenaires/inscription" className="inline-flex min-h-11 items-center hover:text-white">Référencer une agence</Link>
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
