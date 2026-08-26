"use client";

import { useState } from "react";
import { Field, inputClass, buttonClass } from "@/components/ui";
import type { PartnerApplicationType } from "@/lib/domain/types";

export function FormulairePartenaire() {
  const [type, setType] = useState<PartnerApplicationType>("COMPAGNIE");
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);

  if (reference) return <div role="status" className="rounded-[12px] border border-succes/30 bg-succes-doux p-5 text-sm text-succes"><p className="font-bold">Votre demande a bien été reçue.</p><p className="mt-1">Référence : <span className="font-mono">{reference}</span>. L’équipe Mobembo vous contactera après vérification.</p></div>;

  const independant = type === "INDEPENDANT";

  return (
    <form className="space-y-4" onSubmit={async (event) => {
      event.preventDefault();
      setErreur(null);
      setOccupe(true);
      const form = new FormData(event.currentTarget);
      try {
        const response = await fetch("/api/partenaires/candidatures", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type, compagnie: form.get("compagnie"), contact: form.get("contact"), telephone: form.get("telephone"), email: form.get("email"), ville: form.get("ville"), agence: form.get("agence"), destinations: form.get("destinations"), nombreBus: independant ? 1 : Number(form.get("nombreBus") || 0) }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message ?? "Envoi impossible.");
        setReference(data.candidature.id);
      } catch (error) {
        setErreur(error instanceof Error ? error.message : "Envoi impossible.");
      } finally {
        setOccupe(false);
      }
    }}>
      {erreur && <p role="alert" className="rounded-[10px] bg-alerte-doux px-3 py-2 text-sm text-alerte">{erreur}</p>}

      <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Type de candidature">
        {([
          ["COMPAGNIE", "Je gère une compagnie", "Plusieurs bus, une ou plusieurs agences."],
          ["INDEPENDANT", "Je conduis mon propre véhicule", "Un chauffeur indépendant, sans compagnie."],
        ] as const).map(([valeur, titre, description]) => (
          <button
            key={valeur}
            type="button"
            role="radio"
            aria-checked={type === valeur}
            onClick={() => setType(valeur)}
            className={`rounded-[10px] border p-3.5 text-left transition ${
              type === valeur ? "border-accent bg-accent-doux" : "border-bordure hover:bg-surface-alt"
            }`}
          >
            <p className="text-sm font-semibold text-navy">{titre}</p>
            <p className="mt-0.5 text-xs text-texte-doux">{description}</p>
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {!independant && (
          <Field label="Nom de la compagnie"><input className={inputClass} name="compagnie" required /></Field>
        )}
        <Field label={independant ? "Votre nom" : "Responsable"}>
          <input className={inputClass} name="contact" autoComplete="name" required />
        </Field>
        <Field label="Téléphone"><input className={inputClass} name="telephone" inputMode="tel" autoComplete="tel" required /></Field>
        <Field label="E-mail"><input className={inputClass} name="email" type="email" autoComplete="email" /></Field>
        <Field label="Ville principale"><input className={inputClass} name="ville" required /></Field>
        {!independant && (
          <>
            <Field label="Nom de la première agence"><input className={inputClass} name="agence" required /></Field>
            <Field label="Nombre de bus"><input className={inputClass} name="nombreBus" type="number" min="0" defaultValue="1" /></Field>
          </>
        )}
        <Field label="Destinations envisagées" hint="Ex. Kinshasa, Matadi, Kikwit"><input className={inputClass} name="destinations" /></Field>
      </div>
      <button className={buttonClass} type="submit" disabled={occupe}>{occupe ? "Envoi…" : "Envoyer la demande"}</button>
    </form>
  );
}
