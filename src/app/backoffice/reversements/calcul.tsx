"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatMoney, type Currency } from "@/lib/core/money";
import { Field, inputClass, buttonClass } from "@/components/ui";

export function CalculReversement({
  periode,
}: {
  periode: { periodStart: string; periodEnd: string; payableOn: string };
}) {
  const router = useRouter();
  const [du, setDu] = useState(periode.periodStart.slice(0, 10));
  const [au, setAu] = useState(periode.periodEnd.slice(0, 10));
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [resultat, setResultat] = useState<{
    netPayable: number;
    currency: string;
    grossSales: number;
  } | null>(null);

  return (
    <form
      className="grid gap-3 sm:grid-cols-3"
      onSubmit={async (event) => {
        event.preventDefault();
        setErreur(null);
        setOccupe(true);
        try {
          const response = await fetch("/api/backoffice/reversements", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              action: "CALCULER",
              du: `${du}T00:00:00.000Z`,
              au: `${au}T00:00:00.000Z`,
            }),
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.message ?? "Calcul impossible.");
          setResultat(data.reversement);
          router.refresh();
        } catch (error) {
          setErreur((error as Error).message);
        } finally {
          setOccupe(false);
        }
      }}
    >
      {erreur && (
        <p className="rounded-lg border border-alerte/40 bg-alerte-doux px-3 py-2 text-sm text-alerte sm:col-span-3">
          {erreur}
        </p>
      )}
      <Field label="Du">
        <input type="date" className={inputClass} value={du} onChange={(e) => setDu(e.target.value)} />
      </Field>
      <Field label="Au">
        <input type="date" className={inputClass} value={au} onChange={(e) => setAu(e.target.value)} />
      </Field>
      <div className="flex items-end">
        <button type="submit" className={`${buttonClass} w-full`} disabled={occupe}>
          {occupe ? "Calcul…" : "Calculer"}
        </button>
      </div>

      {resultat && (
        <p className="rounded-lg border border-succes/40 bg-succes-doux px-3 py-2 text-sm text-succes sm:col-span-3">
          Ventes en ligne {formatMoney(resultat.grossSales, resultat.currency as Currency)} — net à
          reverser{" "}
          <strong>{formatMoney(resultat.netPayable, resultat.currency as Currency)}</strong>.
        </p>
      )}
    </form>
  );
}
