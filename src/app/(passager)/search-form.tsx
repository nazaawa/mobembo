"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Field, inputClass, buttonClass } from "@/components/ui";

export function SearchForm({
  villes,
  defaultDate,
  compact = false,
  initial,
}: {
  villes: string[];
  defaultDate: string;
  compact?: boolean;
  initial?: { origine?: string; destination?: string; date?: string };
}) {
  const router = useRouter();
  const [origine, setOrigine] = useState(initial?.origine ?? villes[0] ?? "");
  const [destination, setDestination] = useState(
    initial?.destination ?? villes.find((v) => v !== (initial?.origine ?? villes[0])) ?? "",
  );
  const [date, setDate] = useState(initial?.date ?? defaultDate);

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
          min={new Date().toISOString().slice(0, 10)}
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
