"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { MobemboLogo } from "@/components/brand";

const navigation = [
  { href: "/#recherche", label: "Réserver" },
  { href: "/#axes-disponibles", label: "Destinations" },
  { href: "/#agences-partenaires", label: "Pour les agences" },
  { href: "/#comment-ca-marche", label: "Comment ça marche" },
] as const;

export function PassengerHeader({ authenticated }: { authenticated: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-bordure bg-surface/95 backdrop-blur-md">
      <div className="mx-auto grid h-[76px] max-w-7xl grid-cols-[auto_1fr_auto] items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="group inline-flex min-h-11 items-center" aria-label="Mobembo, accueil">
          <MobemboLogo alt="" className="h-8 w-auto transition-transform duration-300 ease-depart group-hover:-translate-y-0.5 motion-reduce:transform-none motion-reduce:transition-none sm:h-9" />
        </Link>

        <nav className="hidden items-center justify-center gap-1 lg:flex" aria-label="Navigation principale">
          {navigation.map((item) => (
            <Link key={item.href} href={item.href} className="inline-flex min-h-11 items-center rounded-[9px] px-4 text-sm font-semibold text-texte-doux transition hover:bg-surface-alt hover:text-navy">
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center justify-end gap-2">
          <Link
            href="/mes-billets"
            aria-current={pathname === "/mes-billets" ? "page" : undefined}
            className={`inline-flex h-11 min-h-11 items-center justify-center gap-2 rounded-[10px] border px-3 text-sm font-semibold transition sm:px-4 ${pathname === "/mes-billets" ? "border-accent bg-accent-doux text-accent" : "border-bordure text-navy hover:border-accent hover:text-accent"}`}
          >
            <TicketIcon />
            <span className="hidden sm:inline">Mes billets</span>
          </Link>
          <Link
            href="/profil"
            aria-current={pathname === "/profil" ? "page" : undefined}
            className="hidden min-h-11 items-center gap-2 rounded-[10px] bg-accent px-4 text-sm font-bold text-white transition hover:bg-accent-profond lg:inline-flex"
          >
            {authenticated && <span className="h-2 w-2 rounded-full bg-white" aria-hidden />}
            {authenticated ? "Mon profil" : "Se connecter"}
          </Link>
          <button
            type="button"
            aria-expanded={open}
            aria-controls="navigation-passager-mobile"
            aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
            className="inline-flex h-11 w-11 items-center justify-center rounded-[10px] border border-bordure text-navy transition hover:border-accent hover:text-accent lg:hidden"
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>
      </div>

      {open && (
        <nav id="navigation-passager-mobile" aria-label="Navigation mobile" className="border-t border-bordure bg-surface px-4 pb-4 pt-2 shadow-[0_18px_35px_rgba(8,22,45,0.10)] sm:px-6 lg:hidden">
          <div className="mx-auto grid max-w-7xl gap-1">
            {navigation.map((item) => (
              <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className="inline-flex min-h-11 items-center rounded-[10px] px-3 text-sm font-semibold text-navy hover:bg-surface-alt">
                {item.label}
              </Link>
            ))}
            <Link href="/profil" onClick={() => setOpen(false)} className="mt-2 inline-flex min-h-11 items-center justify-center rounded-[10px] bg-accent px-4 text-sm font-bold text-white">
              {authenticated ? "Mon profil" : "Se connecter"}
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}

function TicketIcon() {
  return <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="M4 7a2 2 0 0 0 0 4v6h16v-6a2 2 0 0 0 0-4V5H4v2Z"/><path d="M9 8v6"/></svg>;
}

function MenuIcon() {
  return <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M4 7h16M4 12h16M4 17h16"/></svg>;
}

function CloseIcon() {
  return <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="m6 6 12 12M18 6 6 18"/></svg>;
}
