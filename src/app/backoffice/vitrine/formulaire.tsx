"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CompanyProfile } from "@/lib/domain/directory";
import { Field, buttonClass, inputClass } from "@/components/ui";

export function FormulaireVitrine({ fiche }: { fiche: CompanyProfile }) {
  const router = useRouter();
  const [valeurs, setValeurs] = useState({
    description: fiche.description ?? "",
    telephone: fiche.phone ?? "",
    whatsapp: fiche.whatsapp ?? "",
    email: fiche.email ?? "",
    villeSiege: fiche.head_office_city ?? "",
    adresse: fiche.address ?? "",
    services: fiche.services ?? "",
  });
  const [erreur, setErreur] = useState<string | null>(null);
  const [enregistre, setEnregistre] = useState(false);
  const [occupe, setOccupe] = useState(false);

  const modifier = (champ: keyof typeof valeurs, valeur: string) => {
    setValeurs((actuel) => ({ ...actuel, [champ]: valeur }));
    setEnregistre(false);
  };

  const soumettre = async () => {
    setErreur(null);
    setOccupe(true);
    try {
      const response = await fetch("/api/backoffice/vitrine", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(valeurs),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Enregistrement impossible.");
      setEnregistre(true);
      router.refresh();
    } catch (error) {
      setErreur((error as Error).message);
    } finally {
      setOccupe(false);
    }
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        soumettre();
      }}
    >
      {erreur && (
        <p role="alert" className="rounded-lg border border-alerte/40 bg-alerte-doux px-3 py-2 text-sm text-alerte">
          {erreur}
        </p>
      )}
      {enregistre && (
        <p role="status" className="rounded-lg border border-succes/30 bg-succes-doux px-3 py-2 text-sm text-succes">
          Fiche mise à jour. La date de mise à jour affichée aux voyageurs vient d’être renouvelée.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Téléphone" hint="Le numéro qui décroche vraiment.">
          <input
            className={inputClass}
            inputMode="tel"
            value={valeurs.telephone}
            onChange={(event) => modifier("telephone", event.target.value)}
            placeholder="081 234 5678"
          />
        </Field>
        <Field label="WhatsApp" hint="Laissez vide si c’est le même numéro et qu’il n’a pas WhatsApp.">
          <input
            className={inputClass}
            inputMode="tel"
            value={valeurs.whatsapp}
            onChange={(event) => modifier("whatsapp", event.target.value)}
            placeholder="081 234 5678"
          />
        </Field>
        <Field label="Ville du siège">
          <input
            className={inputClass}
            value={valeurs.villeSiege}
            onChange={(event) => modifier("villeSiege", event.target.value)}
            placeholder="Kinshasa"
          />
        </Field>
        <Field label="E-mail" hint="Facultatif.">
          <input
            className={inputClass}
            type="email"
            value={valeurs.email}
            onChange={(event) => modifier("email", event.target.value)}
          />
        </Field>
      </div>

      <Field label="Adresse principale" hint="Où les voyageurs vous trouvent.">
        <input
          className={inputClass}
          value={valeurs.adresse}
          onChange={(event) => modifier("adresse", event.target.value)}
          placeholder="12, avenue du Commerce, Gombe"
        />
      </Field>

      <Field
        label="Présentation"
        hint="Deux ou trois phrases. Ce que vous diriez à un voyageur qui vous appelle pour la première fois."
      >
        <textarea
          rows={3}
          className={inputClass}
          value={valeurs.description}
          onChange={(event) => modifier("description", event.target.value)}
          placeholder="Transport interurbain sur l'axe Kinshasa – Bas-Congo depuis 2008. Départs quotidiens en bus climatisés."
        />
      </Field>

      <Field label="Services proposés" hint="Un service par ligne. Ex. bagages inclus, colis, VIP.">
        <textarea
          rows={3}
          className={inputClass}
          value={valeurs.services}
          onChange={(event) => modifier("services", event.target.value)}
          placeholder={"Bagage de 20 kg inclus\nTransport de colis\nBus climatisé"}
        />
      </Field>

      <button type="submit" className={buttonClass} disabled={occupe}>
        {occupe ? "Enregistrement…" : "Enregistrer la fiche"}
      </button>
    </form>
  );
}
