"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Group = { label: string; items: ReadonlyArray<{ href: string; label: string; icon: string }> };

export function BackofficeNavigation({ groups, mobile = false }: { groups: ReadonlyArray<Group>; mobile?: boolean }) {
  const pathname = usePathname();
  const isActive = (href: string) => href === "/backoffice" ? pathname === href : pathname.startsWith(href);

  if (mobile) return (
    <nav aria-label="Navigation du back-office" className="flex gap-1 overflow-x-auto py-2">
      {groups.flatMap((group) => group.items).map((item) => (
        <Link key={item.href} href={item.href} className={`inline-flex min-h-11 shrink-0 items-center rounded-[9px] px-3 text-xs font-semibold ${isActive(item.href) ? "bg-navy text-white" : "text-texte-doux hover:bg-surface-alt"}`}>{item.label}</Link>
      ))}
    </nav>
  );

  return (
    <nav aria-label="Navigation du back-office" className="mt-6 flex-1 overflow-y-auto px-3 pb-5">
      {groups.map((group) => (
        <div key={group.label} className="mb-5">
          <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-white/35">{group.label}</p>
          <div className="space-y-1">
            {group.items.map((item) => (
              <Link key={item.href} href={item.href} className={`flex min-h-11 items-center gap-3 rounded-[10px] px-3 text-sm font-medium transition ${isActive(item.href) ? "bg-white text-navy shadow-sm" : "text-white/65 hover:bg-white/10 hover:text-white"}`}>
                <NavIcon name={item.icon} />{item.label}
              </Link>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}

function NavIcon({ name }: { name: string }) {
  const c = "h-[18px] w-[18px] shrink-0";
  if (name === "calendar") return <svg viewBox="0 0 24 24" className={c} fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>;
  if (name === "bus") return <svg viewBox="0 0 24 24" className={c} fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="5" y="3" width="14" height="16" rx="3"/><path d="M7 8h10M8 21v-2M16 21v-2"/><circle cx="8" cy="15" r="1"/><circle cx="16" cy="15" r="1"/></svg>;
  if (name === "chart") return <svg viewBox="0 0 24 24" className={c} fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/></svg>;
  if (name === "wallet") return <svg viewBox="0 0 24 24" className={c} fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 6h14a2 2 0 0 1 2 2v11H4a2 2 0 0 1-2-2V6a3 3 0 0 1 3-3h12"/><path d="M15 11h7v5h-7a2 2 0 0 1 0-5Z"/></svg>;
  if (name === "users") return <svg viewBox="0 0 24 24" className={c} fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M16 4a4 4 0 0 1 0 8M18 15a6 6 0 0 1 4 6"/></svg>;
  if (name === "settings") return <svg viewBox="0 0 24 24" className={c} fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9 7 7M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1"/></svg>;
  if (name === "pin") return <svg viewBox="0 0 24 24" className={c} fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>;
  if (name === "journal") return <svg viewBox="0 0 24 24" className={c} fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 3h14v18H5a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3Z"/><path d="M5 3v18M9 8h6M9 12h6"/></svg>;
  return <svg viewBox="0 0 24 24" className={c} fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>;
}
