"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Field, inputClass, buttonClass } from "@/components/ui";

export function SearchForm({
  villes,
  defaultDate,
  compact = false,
  hero = false,
  initial,
}: {
  villes: string[];
  defaultDate: string;
  compact?: boolean;
  hero?: boolean;
  initial?: { origine?: string; destination?: string; date?: string };
}) {
  const router = useRouter();
  const [origine, setOrigine] = useState(initial?.origine ?? villes[0] ?? "");
  const [destination, setDestination] = useState(
    initial?.destination ?? villes.find((v) => v !== (initial?.origine ?? villes[0])) ?? "",
  );
  const [date, setDate] = useState(initial?.date ?? defaultDate);

  if (hero) {
    return (
      <form
        className="rounded-[14px] bg-white p-4 shadow-[0_28px_70px_rgba(8,22,45,0.2)] sm:p-6"
        onSubmit={(event) => {
          event.preventDefault();
          const params = new URLSearchParams({ origine, destination, date });
          router.push(`/recherche?${params}`);
        }}
      >
        <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-navy">
            <span className="h-2.5 w-2.5 rounded-full bg-accent" aria-hidden />
            Aller simple
          </div>
          <p className="text-xs text-texte-doux">Même prix qu&apos;au guichet</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_48px_1fr_0.9fr_0.82fr] lg:items-end">
          <HeroField label="Départ" icon={<PinIcon />} endIcon={<ChevronIcon />}>
            <select value={origine} onChange={(e) => setOrigine(e.target.value)}>
              {villes.map((ville) => <option key={ville}>{ville}</option>)}
            </select>
          </HeroField>

          <button
            type="button"
            aria-label="Inverser les villes de départ et d'arrivée"
            className="hidden h-12 w-12 items-center justify-center self-end rounded-[10px] bg-surface-alt text-navy transition duration-300 ease-depart hover:bg-accent-doux hover:text-accent lg:flex"
            onClick={() => {
              setOrigine(destination);
              setDestination(origine);
            }}
          >
            <SwapIcon />
          </button>

          <HeroField label="Arrivée" icon={<PinIcon />} endIcon={<ChevronIcon />}>
            <select value={destination} onChange={(e) => setDestination(e.target.value)}>
              {villes.map((ville) => <option key={ville}>{ville}</option>)}
            </select>
          </HeroField>

          <HeroField label="Date du voyage" icon={<CalendarIcon />}>
            <input
              type="date"
              value={date}
              min={defaultDate}
              onChange={(e) => setDate(e.target.value)}
            />
          </HeroField>

          <button
            type="submit"
            className="inline-flex h-[60px] w-full items-center justify-center gap-2 rounded-[10px] bg-accent px-5 text-sm font-bold text-white transition duration-300 ease-depart hover:-translate-y-0.5 hover:bg-accent-profond disabled:opacity-50 sm:col-span-2 lg:col-span-1"
          >
            Rechercher
            <ArrowIcon />
          </button>
        </div>
      </form>
    );
  }

  return (
    <form
      className={compact ? "grid gap-3 sm:grid-cols-4" : "grid gap-4 sm:grid-cols-2"}
      onSubmit={(event) => {
        event.preventDefault();
        const params = new URLSearchParams({ origine, destination, date });
        router.push(`/recherche?${params}`);
      }}
    >
      <Field label="Ville de départ">
        <select className={inputClass} value={origine} onChange={(e) => setOrigine(e.target.value)}>
          {villes.map((ville) => (
            <option key={ville} value={ville}>
              {ville}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Ville d'arrivée">
        <select
          className={inputClass}
          value={destination}
          onChange={(e) => setDestination(e.target.value)}
        >
          {villes.map((ville) => (
            <option key={ville} value={ville}>
              {ville}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Date du voyage">
        <input
          type="date"
          className={inputClass}
          value={date}
          min={defaultDate}
          onChange={(e) => setDate(e.target.value)}
        />
      </Field>

      <div className={compact ? "flex items-end" : "flex items-end sm:col-span-2"}>
        <button type="submit" className={`${buttonClass} w-full`}>
          Rechercher
        </button>
      </div>
    </form>
  );
}

function HeroField({
  label,
  icon,
  endIcon,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  endIcon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-2 block text-xs font-semibold text-texte-doux">{label}</span>
      <span className="hero-search-field flex h-[60px] items-center gap-2.5 rounded-[10px] bg-surface-alt px-4 text-navy outline outline-1 outline-transparent transition duration-300 ease-depart focus-within:bg-white focus-within:outline-accent">
        <span className="shrink-0 text-accent" aria-hidden>{icon}</span>
        <span className="min-w-0 flex-1 [&_input]:h-full [&_input]:w-full [&_input]:border-0 [&_input]:bg-transparent [&_input]:p-0 [&_input]:text-base [&_input]:font-semibold [&_input]:outline-none [&_input]:ring-0 [&_select]:h-full [&_select]:w-full [&_select]:appearance-none [&_select]:border-0 [&_select]:bg-transparent [&_select]:p-0 [&_select]:text-base [&_select]:font-semibold [&_select]:outline-none [&_select]:ring-0">
          {children}
        </span>
        {endIcon && <span className="shrink-0 text-texte-doux" aria-hidden>{endIcon}</span>}
      </span>
    </label>
  );
}

function PinIcon() {
  return <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>;
}

function CalendarIcon() {
  return <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>;
}

function SwapIcon() {
  return <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m7 7 3-3m-3 3 3 3M7 7h10M17 17l-3 3m3-3-3-3m3 3H7"/></svg>;
}

function ChevronIcon() {
  return <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="m7 10 5 5 5-5"/></svg>;
}

function ArrowIcon() {
  return <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14m-5-5 5 5-5 5"/></svg>;
}
