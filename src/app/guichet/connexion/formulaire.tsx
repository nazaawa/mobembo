"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field, inputClass, buttonClass } from "@/components/ui";
import { ROLE_LABELS, type Role } from "@/lib/domain/types";

interface SessionResumee {
  activeRole: Role;
  availableRoles: Array<{ role: Role; companyId: string | null; agencyId: string | null }>;
}

const DESTINATIONS: Record<Role, string> = {
  SUPER_ADMIN: "/backoffice",
  ADMIN_COMPAGNIE: "/backoffice",
  GERANT_AGENCE: "/backoffice",
  GUICHETIER: "/guichet",
  CONTROLEUR: "/controle",
  PASSAGER: "/",
};

export function FormulaireConnexion() {
  const router = useRouter();
  const [telephone, setTelephone] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [session, setSession] = useState<SessionResumee | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);

  const connecter = async () => {
    setErreur(null);
    setOccupe(true);
    try {
      const response = await fetch("/api/auth/connexion", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: telephone, password: motDePasse }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(
          data.erreur === "NON_AUTHENTIFIE"
            ? "Numéro ou mot de passe incorrect."
            : (data.message ?? "Connexion impossible."),
        );
      }
      const staff = (data.session as SessionResumee).availableRoles.filter(
        (r) => r.role !== "PASSAGER",
      );
      if (staff.length > 1) {
        setSession(data.session);
      } else {
        router.push(DESTINATIONS[(data.session as SessionResumee).activeRole]);
        router.refresh();
      }
    } catch (error) {
      setErreur((error as Error).message);
    } finally {
      setOccupe(false);
    }
  };

  const basculer = async (cible: {
    role: Role;
    companyId: string | null;
    agencyId: string | null;
  }) => {
    setOccupe(true);
    try {
      await fetch("/api/auth/role", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(cible),
      });
      router.push(DESTINATIONS[cible.role]);
      router.refresh();
    } finally {
      setOccupe(false);
    }
  };

  if (session) {
    const staff = session.availableRoles.filter((r) => r.role !== "PASSAGER");
    return (
      <div className="space-y-3">
        <p className="text-sm text-texte-doux">
          Vous cumulez plusieurs rôles. Choisissez celui avec lequel vous travaillez maintenant —
          il sera le seul actif pendant cette session.
        </p>
        <ul className="space-y-2">
          {staff.map((role, index) => (
            <li key={index}>
              <button
                type="button"
                className={`${buttonClass} w-full`}
                disabled={occupe}
                onClick={() => basculer(role)}
              >
                {ROLE_LABELS[role.role]}
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        connecter();
      }}
    >
      {erreur && (
        <p className="rounded-lg border border-alerte/40 bg-alerte-doux px-3 py-2 text-sm text-alerte">
          {erreur}
        </p>
      )}
      <Field label="Téléphone">
        <input
          className={inputClass}
          inputMode="tel"
          autoComplete="username"
          value={telephone}
          onChange={(e) => setTelephone(e.target.value)}
          placeholder="081 000 0004"
        />
      </Field>
      <Field label="Mot de passe">
        <input
          className={inputClass}
          type="password"
          autoComplete="current-password"
          value={motDePasse}
          onChange={(e) => setMotDePasse(e.target.value)}
        />
      </Field>
      <button type="submit" className={`${buttonClass} w-full`} disabled={occupe}>
        {occupe ? "Connexion…" : "Se connecter"}
      </button>
    </form>
  );
}
