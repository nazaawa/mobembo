"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Field,
  Money,
  inputClass,
  buttonClass,
  buttonSecondaryClass,
  buttonDangerClass,
} from "@/components/ui";

interface OptionGrille {
  action: string;
  label: string;
  disponible: boolean;
  raison?: string;
}

/**
 * §2.9 : le gradient d'incitation rendu cliquable. Les options indisponibles
 * restent visibles avec leur raison — un passager qui ne comprend pas pourquoi
 * une option a disparu appelle l'agence.
 */
export function ActionsBillet({
  ticketId,
  statut,
  revente,
  grille,
}: {
  ticketId: string;
  statut: string;
  revente: { eligible: boolean; raison?: string; fee?: number; netVendeur?: number };
  grille: OptionGrille[];
}) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState<"TRANSFERT" | null>(null);
  const [nom, setNom] = useState("");
  const [telephone, setTelephone] = useState("");
  const [occupe, setOccupe] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const appel = async (url: string, init: RequestInit) => {
    setErreur(null);
    setMessage(null);
    setOccupe(true);
    try {
      const response = await fetch(url, {
        ...init,
        headers: { "content-type": "application/json", ...(init.headers ?? {}) },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Erreur inattendue.");
      router.refresh();
      return data;
    } catch (error) {
      setErreur((error as Error).message);
      return null;
    } finally {
      setOccupe(false);
    }
  };

  const optionDisponible = (action: string) =>
    grille.find((o) => o.action === action)?.disponible ?? false;

  return (
    <div className="space-y-3">
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

      <div className="flex flex-wrap gap-2">
        {statut === "EN_REVENTE" ? (
          <button
            type="button"
            className={buttonSecondaryClass}
            disabled={occupe}
            onClick={async () => {
              const data = await appel(`/api/billets/${ticketId}/revente`, { method: "DELETE" });
              if (data) setMessage("Votre billet est retiré de la vente. Il reste valable.");
            }}
          >
            Retirer de la vente
          </button>
        ) : (
          <button
            type="button"
            className={buttonClass}
            disabled={!revente.eligible || occupe}
            title={revente.raison}
            onClick={async () => {
              const data = await appel(`/api/billets/${ticketId}/revente`, { method: "POST" });
              if (data) {
                setMessage(
                  "Votre siège est en vente. Tant qu'aucun acheteur ne s'est manifesté, votre " +
                    "billet reste valable — vous ne risquez rien.",
                );
              }
            }}
          >
            Remettre en vente
            {revente.netVendeur !== undefined && (
              <span className="text-xs opacity-90">
                (vous recevez <Money amount={revente.netVendeur} currency="USD" />)
              </span>
            )}
          </button>
        )}

        <button
          type="button"
          className={buttonSecondaryClass}
          disabled={!optionDisponible("TRANSFERT") || occupe}
          onClick={() => setOuvert(ouvert === "TRANSFERT" ? null : "TRANSFERT")}
        >
          Transférer à un proche (gratuit)
        </button>

        <button
          type="button"
          className={buttonSecondaryClass}
          disabled={!optionDisponible("REPORT") || occupe}
          onClick={async () => {
            if (!confirm("Annuler ce billet et recevoir un avoir de 100 % valable 60 jours ?")) {
              return;
            }
            const data = await appel(`/api/billets/${ticketId}/renoncement`, {
              method: "POST",
              body: JSON.stringify({ action: "REPORT" }),
            });
            if (data) setMessage("Avoir émis. Il s'applique à votre prochaine réservation.");
          }}
        >
          Reporter (avoir 100 %)
        </button>

        <button
          type="button"
          className={buttonDangerClass}
          disabled={!optionDisponible("ANNULATION_TARDIVE") || occupe}
          onClick={async () => {
            if (!confirm("Annuler tardivement ? Vous récupérez 50 % en avoir valable 30 jours.")) {
              return;
            }
            const data = await appel(`/api/billets/${ticketId}/renoncement`, {
              method: "POST",
              body: JSON.stringify({ action: "ANNULATION_TARDIVE" }),
            });
            if (data) setMessage("Billet annulé, avoir de 50 % émis.");
          }}
        >
          Annuler (avoir 50 %)
        </button>
      </div>

      {!revente.eligible && revente.raison && statut !== "EN_REVENTE" && (
        <p className="text-xs text-texte-doux">Revente indisponible : {revente.raison}</p>
      )}

      {ouvert === "TRANSFERT" && (
        <div className="rounded-lg border border-bordure bg-surface-alt p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nom du bénéficiaire">
              <input className={inputClass} value={nom} onChange={(e) => setNom(e.target.value)} />
            </Field>
            <Field label="Son téléphone">
              <input
                className={inputClass}
                inputMode="tel"
                value={telephone}
                onChange={(e) => setTelephone(e.target.value)}
              />
            </Field>
          </div>
          <button
            type="button"
            className={`${buttonClass} mt-3`}
            disabled={!nom || !telephone || occupe}
            onClick={async () => {
              const data = await appel(`/api/billets/${ticketId}/transfert`, {
                method: "POST",
                body: JSON.stringify({ nom, telephone }),
              });
              if (data) {
                setOuvert(null);
                setMessage(
                  `Billet transféré à ${nom}. Un nouveau QR lui a été envoyé ; le vôtre n'est ` +
                    "plus valable.",
                );
              }
            }}
          >
            Transférer le billet
          </button>
          <p className="mt-2 text-xs text-texte-doux">
            Le transfert ne coûte rien : aucun remboursement n&apos;est décaissé, le siège change
            simplement de nom.
          </p>
        </div>
      )}
    </div>
  );
}
