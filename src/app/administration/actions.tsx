"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { buttonClass, buttonDangerClass, buttonSecondaryClass, inputClass } from "@/components/ui";
import { COMPANY_MODULES, MODULE_DETAILS, type CompanyModule } from "@/lib/domain/modules";

export function ChoisirCompagnie({ id, active }: { id: string; active: boolean }) {
  const router = useRouter();
  const [occupe, setOccupe] = useState(false);
  return <button type="button" className={active ? buttonSecondaryClass : buttonClass} disabled={occupe} onClick={async () => { setOccupe(true); const response = await fetch("/api/auth/compagnie", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ compagnieId: id }) }); if (response.ok) router.push("/backoffice"); else setOccupe(false); }}>{occupe ? "Ouverture…" : active ? "Rouvrir" : "Gérer"}</button>;
}

export function TraiterCandidature({ id }: { id: string }) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [motDePasse, setMotDePasse] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const traiter = async (decision: "APPROUVER" | "REFUSER") => {
    setErreur(null); setOccupe(true);
    try {
      const response = await fetch(`/api/administration/candidatures/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision, motDePasseInitial: motDePasse }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Traitement impossible.");
      router.refresh();
    } catch (error) { setErreur(error instanceof Error ? error.message : "Traitement impossible."); }
    finally { setOccupe(false); }
  };
  if (!ouvert) return <button type="button" className={buttonSecondaryClass} onClick={() => setOuvert(true)}>Traiter</button>;
  return <div className="min-w-52 space-y-2">{erreur && <p role="alert" className="text-xs text-alerte">{erreur}</p>}<input className={inputClass} type="password" value={motDePasse} onChange={(event) => setMotDePasse(event.target.value)} placeholder="Mot de passe initial" aria-label="Mot de passe initial" /><div className="flex gap-2"><button type="button" className={buttonClass} disabled={occupe || motDePasse.length < 8} onClick={() => traiter("APPROUVER")}>Approuver</button><button type="button" className={buttonDangerClass} disabled={occupe} onClick={() => traiter("REFUSER")}>Refuser</button></div></div>;
}

/**
 * §6 : le référencement est gratuit et accordé par défaut. Ce bouton ne sert
 * qu'au cas prévu par la note — une information manifestement incorrecte qu'il
 * faut retirer de la vue des voyageurs, sans couper l'agence de son outil.
 */
export function BasculerAnnuaire({ id, reference }: { id: string; reference: boolean }) {
  const router = useRouter();
  const [occupe, setOccupe] = useState(false);
  return (
    <button
      type="button"
      className={reference ? buttonSecondaryClass : buttonClass}
      disabled={occupe}
      onClick={async () => {
        setOccupe(true);
        const response = await fetch("/api/administration/annuaire", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ compagnieId: id, reference: !reference }),
        });
        if (response.ok) router.refresh();
        setOccupe(false);
      }}
    >
      {reference ? "Retirer de l\u2019annuaire" : "Remettre dans l\u2019annuaire"}
    </button>
  );
}

/**
 * Ouverture des phases, agence par agence.
 *
 * §33 : « Une nouvelle phase ne doit pas être lancée uniquement parce qu'elle
 * est prévue dans la feuille de route. » Chaque case cochée ici ajoute des
 * écrans au back-office d'une agence réelle : l'écran rappelle donc ce que
 * chaque module lui demandera en retour, avant le clic.
 */
export function ModulesAgence({ id, modules }: { id: string; modules: CompanyModule[] }) {
  const router = useRouter();
  const [selection, setSelection] = useState<CompanyModule[]>(modules);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const modifie =
    COMPANY_MODULES.filter((m) => selection.includes(m)).join(",") !==
    COMPANY_MODULES.filter((m) => modules.includes(m)).join(",");

  const enregistrer = async () => {
    setErreur(null);
    setOccupe(true);
    try {
      const response = await fetch("/api/administration/modules", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ compagnieId: id, modules: selection }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Enregistrement impossible.");
      router.refresh();
    } catch (error) {
      setErreur((error as Error).message);
    } finally {
      setOccupe(false);
    }
  };

  return (
    <div className="min-w-56 space-y-1.5">
      {erreur && <p role="alert" className="text-xs text-alerte">{erreur}</p>}
      <div className="flex flex-wrap gap-1.5">
        {COMPANY_MODULES.map((module) => {
          const actif = selection.includes(module);
          const detail = MODULE_DETAILS[module];
          return (
            <button
              key={module}
              type="button"
              aria-pressed={actif}
              title={`Phase ${detail.phase} — ${detail.apport}`}
              onClick={() =>
                setSelection((current) =>
                  current.includes(module)
                    ? current.filter((item) => item !== module)
                    : [...current, module],
                )
              }
              className={`min-h-11 rounded-lg border px-2.5 text-xs font-semibold transition ${
                actif
                  ? "border-succes bg-succes-doux text-succes"
                  : "border-bordure bg-surface text-texte-doux hover:border-accent hover:text-accent"
              }`}
            >
              {detail.phase} · {detail.label}
            </button>
          );
        })}
      </div>
      {modifie && (
        <div className="flex gap-1.5">
          <button
            type="button"
            className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-texte transition hover:brightness-110 disabled:opacity-50"
            disabled={occupe}
            onClick={enregistrer}
          >
            {occupe ? "Enregistrement…" : "Enregistrer"}
          </button>
          <button
            type="button"
            className="rounded-lg border border-bordure px-3 py-1.5 text-xs font-medium transition hover:bg-surface-alt"
            onClick={() => setSelection(modules)}
          >
            Annuler
          </button>
        </div>
      )}
    </div>
  );
}
