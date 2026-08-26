"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ROLE_LABELS, type Role } from "@/lib/domain/types";

interface SessionResumee {
  activeRole: Role;
  availableRoles: AffectationRole[];
}

interface AffectationRole {
  role: Role;
  companyId: string | null;
  agencyId: string | null;
}

const DESTINATIONS: Record<Role, string> = {
  SUPER_ADMIN: "/administration",
  ADMIN_COMPAGNIE: "/backoffice",
  GERANT_AGENCE: "/backoffice",
  GUICHETIER: "/guichet",
  CONTROLEUR: "/controle",
  PASSAGER: "/",
};

function cleAffectation(role: AffectationRole): string {
  return `${role.role}-${role.companyId ?? "plateforme"}-${role.agencyId ?? "toutes"}`;
}

export function FormulaireConnexion() {
  const router = useRouter();
  const [telephone, setTelephone] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [session, setSession] = useState<SessionResumee | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [motDePasseVisible, setMotDePasseVisible] = useState(false);
  const [identifiantsInvalides, setIdentifiantsInvalides] = useState(false);
  const [roleEnCours, setRoleEnCours] = useState<string | null>(null);

  const connecter = async () => {
    setErreur(null);
    setIdentifiantsInvalides(false);
    setOccupe(true);
    try {
      const response = await fetch("/api/auth/connexion", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone: telephone, password: motDePasse }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const refus = data?.erreur === "NON_AUTHENTIFIE";
        setIdentifiantsInvalides(refus);
        throw new Error(refus ? "Numéro ou mot de passe incorrect." : "Connexion impossible. Réessayez.");
      }
      if (!data?.session) throw new Error("Connexion impossible. Réessayez.");
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
      const message = error instanceof Error ? error.message : "";
      setErreur(
        message === "Numéro ou mot de passe incorrect." || message === "Connexion impossible. Réessayez."
          ? message
          : "Connexion impossible. Vérifiez votre réseau et réessayez.",
      );
    } finally {
      setOccupe(false);
    }
  };

  const basculer = async (cible: AffectationRole) => {
    setErreur(null);
    setRoleEnCours(cleAffectation(cible));
    setOccupe(true);
    try {
      const response = await fetch("/api/auth/role", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(cible),
      });
      if (!response.ok) {
        throw new Error("Impossible d’activer ce rôle. Réessayez.");
      }
      router.push(DESTINATIONS[cible.role]);
      router.refresh();
    } catch (error) {
      setErreur((error as Error).message);
    } finally {
      setOccupe(false);
      setRoleEnCours(null);
    }
  };

  if (session) {
    const staff = session.availableRoles.filter((r) => r.role !== "PASSAGER");
    return (
      <div>
        <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-[12px] bg-accent-doux text-accent">
          <RoleIcon />
        </div>
        <h2 className="text-2xl font-bold tracking-[-0.025em] text-navy">Choisissez votre poste</h2>
        <p className="mt-2 text-sm leading-6 text-texte-doux">
          Vous cumulez plusieurs rôles. Choisissez celui avec lequel vous travaillez maintenant —
          il sera le seul actif pendant cette session.
        </p>
        {erreur && (
          <p role="alert" className="mt-4 flex min-h-11 items-center gap-2 rounded-[10px] bg-alerte-doux px-3.5 py-2.5 text-sm font-medium text-alerte">
            <AlertIcon />
            {erreur}
          </p>
        )}
        <ul className="mt-6 space-y-3">
          {staff.map((role) => (
            <li key={cleAffectation(role)}>
              <button
                type="button"
                className="group flex min-h-14 w-full items-center justify-between rounded-[10px] border border-bordure bg-white px-4 text-left text-sm font-semibold text-navy transition hover:border-accent hover:bg-accent-doux disabled:cursor-not-allowed disabled:opacity-50"
                disabled={occupe}
                aria-busy={roleEnCours === cleAffectation(role)}
                onClick={() => basculer(role)}
              >
                <span aria-live="polite">
                  {roleEnCours === cleAffectation(role) ? "Activation…" : ROLE_LABELS[role.role]}
                </span>
                {roleEnCours === cleAffectation(role) ? <SpinnerIcon /> : <ArrowIcon />}
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        connecter();
      }}
    >
      {erreur && (
        <p id="connexion-erreur" role="alert" className="flex min-h-11 items-center gap-2 rounded-[10px] bg-alerte-doux px-3.5 py-2.5 text-sm font-medium text-alerte">
          <AlertIcon />
          {erreur}
        </p>
      )}

      <LoginField id="telephone-agent" label="Numéro de téléphone" icon={<PhoneIcon />}>
        <input
          id="telephone-agent"
          inputMode="tel"
          autoComplete="username"
          value={telephone}
          onChange={(e) => setTelephone(e.target.value)}
          placeholder="+243 810 000 004"
          required
          disabled={occupe}
          aria-invalid={identifiantsInvalides}
          aria-describedby={erreur ? "connexion-erreur" : undefined}
        />
      </LoginField>

      <LoginField id="mot-de-passe-agent" label="Mot de passe" icon={<LockIcon />} action={
        <button
          type="button"
          className="grid h-11 w-11 place-items-center text-texte-doux transition hover:text-accent"
          onClick={() => setMotDePasseVisible((visible) => !visible)}
          aria-label={motDePasseVisible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
          aria-pressed={motDePasseVisible}
        >
          <EyeIcon crossed={motDePasseVisible} />
        </button>
      }>
        <input
          id="mot-de-passe-agent"
          type={motDePasseVisible ? "text" : "password"}
          autoComplete="current-password"
          value={motDePasse}
          onChange={(e) => setMotDePasse(e.target.value)}
          placeholder="Votre mot de passe"
          required
          disabled={occupe}
          aria-invalid={identifiantsInvalides}
          aria-describedby={erreur ? "connexion-erreur" : undefined}
        />
      </LoginField>

      <button
        type="submit"
        className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-[10px] bg-accent px-5 text-sm font-bold text-white transition duration-200 hover:-translate-y-0.5 hover:bg-accent-profond focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60 disabled:hover:translate-y-0 motion-reduce:transform-none motion-reduce:transition-none"
        disabled={occupe}
        aria-busy={occupe}
      >
        <span className="contents" aria-live="polite">
          {occupe ? (
          <>
            <SpinnerIcon /> Connexion en cours…
          </>
        ) : (
          <>
            Se connecter <ArrowIcon />
          </>
          )}
        </span>
      </button>
    </form>
  );
}

function LoginField({
  id,
  label,
  icon,
  action,
  children,
}: {
  id: string;
  label: string;
  icon: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-semibold text-navy">{label}</label>
      <span className="flex min-h-14 items-center gap-3 rounded-[10px] border border-bordure bg-surface-alt px-3.5 text-navy transition focus-within:border-accent focus-within:bg-white focus-within:ring-2 focus-within:ring-accent/15">
        <span className="shrink-0 text-texte-doux" aria-hidden>{icon}</span>
        <span className="min-w-0 flex-1 [&_input]:h-12 [&_input]:w-full [&_input]:bg-transparent [&_input]:text-sm [&_input]:outline-none [&_input]:placeholder:text-texte-doux/75">{children}</span>
        {action && <span className="-mr-2 shrink-0">{action}</span>}
      </span>
    </div>
  );
}

function PhoneIcon() {
  return <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M7 3h3l1.4 4-2 1.7a15 15 0 0 0 5.9 5.9l1.7-2L21 14v3c0 1.1-.9 2-2 2C11.3 19 5 12.7 5 5c0-1.1.9-2 2-2Z" /></svg>;
}

function LockIcon() {
  return <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>;
}

function EyeIcon({ crossed }: { crossed: boolean }) {
  return <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" />{crossed && <path d="m4 4 16 16" />}</svg>;
}

function AlertIcon() {
  return <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9" /><path d="M12 7v6m0 4h.01" /></svg>;
}

function ArrowIcon() {
  return <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14m-5-5 5 5-5 5" /></svg>;
}

function RoleIcon() {
  return <svg aria-hidden viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 7h16v12H4zM8 7V5h8v2M4 11h16M10 15h4" /></svg>;
}

function SpinnerIcon() {
  return <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5 animate-spin motion-reduce:animate-none" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 12a8 8 0 1 1-2.3-5.7" /></svg>;
}
