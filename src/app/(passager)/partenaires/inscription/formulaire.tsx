"use client";

import { useState } from "react";
import { Field, inputClass, buttonClass } from "@/components/ui";

export function FormulairePartenaire() {
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);

  if (reference) return <div role="status" className="rounded-[12px] border border-succes/30 bg-succes-doux p-5 text-sm text-succes"><p className="font-bold">Votre demande a bien été reçue.</p><p className="mt-1">Référence : <span className="font-mono">{reference}</span>. L’équipe Mobembo vous contactera après vérification.</p></div>;

  return (
    <form className="space-y-4" onSubmit={async (event) => {
      event.preventDefault();
      setErreur(null);
      setOccupe(true);
      const form = new FormData(event.currentTarget);
      try {
        const response = await fetch("/api/partenaires/candidatures", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ compagnie: form.get("compagnie"), contact: form.get("contact"), telephone: form.get("telephone"), email: form.get("email"), ville: form.get("ville"), agence: form.get("agence"), destinations: form.get("destinations"), nombreBus: Number(form.get("nombreBus") || 0) }) });
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
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nom de la compagnie"><input className={inputClass} name="compagnie" required /></Field>
        <Field label="Responsable"><input className={inputClass} name="contact" autoComplete="name" required /></Field>
        <Field label="Téléphone"><input className={inputClass} name="telephone" inputMode="tel" autoComplete="tel" required /></Field>
        <Field label="E-mail"><input className={inputClass} name="email" type="email" autoComplete="email" /></Field>
        <Field label="Ville principale"><input className={inputClass} name="ville" required /></Field>
        <Field label="Nom de la première agence"><input className={inputClass} name="agence" required /></Field>
        <Field label="Nombre de bus"><input className={inputClass} name="nombreBus" type="number" min="0" defaultValue="1" /></Field>
        <Field label="Destinations envisagées" hint="Ex. Kinshasa, Matadi, Kikwit"><input className={inputClass} name="destinations" /></Field>
      </div>
      <button className={buttonClass} type="submit" disabled={occupe}>{occupe ? "Envoi…" : "Envoyer la demande"}</button>
    </form>
  );
}
