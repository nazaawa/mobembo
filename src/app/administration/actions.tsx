"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { buttonClass, buttonDangerClass, buttonSecondaryClass, inputClass } from "@/components/ui";

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
