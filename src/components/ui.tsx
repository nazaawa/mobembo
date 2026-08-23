import type { ReactNode } from "react";
import { formatMoney, type Currency } from "@/lib/core/money";

/** Briques d'interface partagées par le POS, la PWA et le back-office. */

export function Card({
  title,
  subtitle,
  actions,
  children,
  className = "",
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-bordure bg-surface shadow-[0_1px_2px_rgba(0,0,0,0.04)] ${className}`}
    >
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-bordure px-4 py-3">
          <div>
            {title && <h2 className="text-sm font-semibold tracking-tight">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-texte-doux">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

const TONES = {
  neutre: "bg-surface-alt text-texte-doux border-bordure",
  accent: "bg-accent-doux text-accent border-accent/30",
  succes: "bg-succes-doux text-succes border-succes/30",
  alerte: "bg-alerte-doux text-alerte border-alerte/30",
  attention: "bg-attention-doux text-attention border-attention/30",
} as const;

export type Tone = keyof typeof TONES;

export function Badge({ tone = "neutre", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = "neutre",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
}) {
  return (
    <div className="rounded-lg border border-bordure bg-surface px-3 py-2.5">
      <div className="text-[11px] uppercase tracking-wide text-texte-doux">{label}</div>
      <div
        className={`mt-1 text-lg font-semibold tabular-nums ${
          tone === "alerte" ? "text-alerte" : tone === "succes" ? "text-succes" : ""
        }`}
      >
        {value}
      </div>
      {hint && <div className="mt-0.5 text-[11px] text-texte-doux">{hint}</div>}
    </div>
  );
}

export function Money({ amount, currency }: { amount: number; currency: string }) {
  return <span className="tabular-nums">{formatMoney(amount, currency as Currency)}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-bordure px-4 py-6 text-center text-sm text-texte-doux">
      {children}
    </p>
  );
}

/**
 * Encadré « pourquoi » : le cahier des charges justifie ses règles les plus
 * contre-intuitives, et l'interface les rappelle à l'agent qui les subit.
 */
export function Why({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border-l-2 border-accent bg-accent-doux px-3 py-2 text-xs leading-relaxed text-texte-doux">
      {children}
    </p>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-texte-doux">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-texte-doux">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "w-full rounded-lg border border-bordure bg-surface px-3 py-2 text-sm outline-none " +
  "focus:border-accent focus:ring-2 focus:ring-accent/20";

export const buttonClass =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm " +
  "font-medium text-accent-texte transition disabled:cursor-not-allowed disabled:opacity-50 " +
  "hover:brightness-110";

export const buttonSecondaryClass =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-bordure bg-surface " +
  "px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 " +
  "hover:bg-surface-alt";

export const buttonDangerClass =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-alerte/40 " +
  "bg-alerte-doux px-4 py-2 text-sm font-medium text-alerte transition " +
  "disabled:cursor-not-allowed disabled:opacity-50 hover:brightness-95";

export function Table({
  headers,
  children,
}: {
  headers: (string | ReactNode)[];
  children: ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-full text-sm">
        <thead>
          <tr className="border-b border-bordure text-left text-[11px] uppercase tracking-wide text-texte-doux">
            {headers.map((header, index) => (
              <th key={index} className="whitespace-nowrap px-2 py-2 font-medium">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-bordure">{children}</tbody>
      </table>
    </div>
  );
}
