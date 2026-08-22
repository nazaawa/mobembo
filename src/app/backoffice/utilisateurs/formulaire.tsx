"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field, inputClass, buttonClass, buttonSecondaryClass } from "@/components/ui";
import { ROLE_LABELS, type Role } from "@/lib/domain/types";

const ROLES_STAFF: Role[] = ["ADMIN_COMPAGNIE", "GERANT_AGENCE", "GUICHETIER", "CONTROLEUR"];

export function FormulaireUtilisateur({ agences }: { agences: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [nom, setNom] = useState("");
  const [telephone, setTelephone] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [roles, setRoles] = useState<Role[]>(["GUICHETIER"]);
  const [agenceId, setAgenceId] = useState(agences[0]?.id ?? "");
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (!ouvert) {
    return (
      <button type="button" className={buttonSecondaryClass} onClick={() => setOuvert(true)}>
        Créer un compte staff
      </button>
    );
  }

  return (
    <form
      className="space-y-3"
      onSubmit={async (event) => {
        event.preventDefault();
        setErreur(null);
        setMessage(null);
        setOccupe(true);
        try {
          const response = await fetch("/api/backoffice/utilisateurs", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              nom,
              telephone,
              motDePasse,
              roles: roles.map((role) => ({
                role,
                agenceId: role === "ADMIN_COMPAGNIE" ? null : agenceId,
              })),
            }),
          });
          const data = await response.json();
          if (!response.ok) throw new Error(data.message ?? "Création impossible.");
          setMessage(`Compte créé pour ${data.utilisateur.name}.`);
          setNom("");
          setTelephone("");
          setMotDePasse("");
          router.refresh();
        } catch (error) {
          setErreur((error as Error).message);
        } finally {
          setOccupe(false);
        }
      }}
    >
      {erreur && (
        <p className="rounded-lg border border-alerte/40 bg-alerte-doux px-3 py-2 text-sm text-alerte">
          {erreur}
        </p>
      )}
      {message && (
        <p className="rounded-lg border border-succes/40 bg-succes-doux px-3 py-2 text-sm text-succes">
          {message}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Nom complet">
          <input className={inputClass} value={nom} onChange={(e) => setNom(e.target.value)} required />
        </Field>
        <Field label="Téléphone">
          <input
            className={inputClass}
            inputMode="tel"
            value={telephone}
            onChange={(e) => setTelephone(e.target.value)}
            required
          />
        </Field>
        <Field label="Mot de passe initial" hint="8 caractères minimum">
          <input
            className={inputClass}
            type="text"
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
            required
          />
        </Field>
        <Field label="Agence de rattachement">
          <select className={inputClass} value={agenceId} onChange={(e) => setAgenceId(e.target.value)}>
            {agences.map((agence) => (
              <option key={agence.id} value={agence.id}>
                {agence.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <fieldset>
        <legend className="mb-1.5 text-xs font-medium text-texte-doux">
          Rôles attribués — un seul sera actif par session
        </legend>
        <div className="flex flex-wrap gap-2">
          {ROLES_STAFF.map((role) => (
            <label
              key={role}
              className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs ${
                roles.includes(role)
                  ? "border-accent bg-accent-doux text-accent"
                  : "border-bordure hover:bg-surface-alt"
              }`}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={roles.includes(role)}
                onChange={() =>
                  setRoles((current) =>
                    current.includes(role)
                      ? current.filter((r) => r !== role)
                      : [...current, role],
                  )
                }
              />
              {ROLE_LABELS[role]}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex gap-2">
        <button type="submit" className={buttonClass} disabled={occupe || roles.length === 0}>
          Créer le compte
        </button>
        <button type="button" className={buttonSecondaryClass} onClick={() => setOuvert(false)}>
          Annuler
        </button>
      </div>
    </form>
  );
}
