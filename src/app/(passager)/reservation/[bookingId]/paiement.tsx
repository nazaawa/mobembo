"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Field, Why, inputClass, buttonClass } from "@/components/ui";
import { MOBILE_MONEY_PROVIDERS, PROVIDER_LABELS } from "@/lib/domain/types";
import type { PaymentProviderId } from "@/lib/domain/types";
import type { Currency } from "@/lib/core/money";

interface StatutPaiement {
  paiement: { id: string; status: string };
  billets: Array<{ id: string }>;
}

/**
 * Reprise de paiement pour une réservation déjà créée (§2.5.5), sans
 * repasser par la sélection de siège. Même logique de sondage que le tunnel
 * de réservation initial (`trajet/[tripId]/reservation.tsx`), extraite ici
 * pour un accès direct depuis « mes billets ».
 */
export function PaiementReprise({
  bookingId,
  devise,
  telephone,
}: {
  bookingId: string;
  devise: Currency;
  telephone: string;
}) {
  const router = useRouter();
  const [operateur, setOperateur] = useState<PaymentProviderId>("MPESA");
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [statut, setStatut] = useState<string | null>(null);

  const appel = async <T,>(url: string, init?: RequestInit): Promise<T> => {
    const response = await fetch(url, {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message ?? "Erreur inattendue.");
    return data as T;
  };

  const versBillet = (statut: StatutPaiement) => {
    if (statut.paiement.status === "CONFIRME" && statut.billets[0]) {
      router.push(`/billet/${statut.billets[0].id}`);
      return true;
    }
    return false;
  };

  const payer = async () => {
    setErreur(null);
    setOccupe(true);
    setStatut("INITIE");
    try {
      // Clé stable par réservation + opérateur : un double clic retombe sur
      // le même paiement plutôt que d'en initier un second (§3.2).
      const cleIdempotence = `${bookingId}:${operateur}`;
      const init = await appel<{ paiement: { id: string; status: string } }>("/api/paiements", {
        method: "POST",
        body: JSON.stringify({ reservationId: bookingId, operateur, telephone, cleIdempotence }),
      });

      let paiement = init.paiement;

      // Un avoir qui couvre tout le montant confirme sans passer par
      // l'opérateur : le paiement est déjà CONFIRME dès cet appel.
      if (paiement.status === "CONFIRME") {
        const statutInitial = await appel<StatutPaiement>(`/api/paiements/${paiement.id}/statut`);
        if (versBillet(statutInitial)) return;
      }

      for (let essai = 0; essai < 60 && paiement.status === "INITIE"; essai++) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        const statutSuivant = await appel<StatutPaiement>(`/api/paiements/${paiement.id}/statut`);
        paiement = statutSuivant.paiement;
        setStatut(paiement.status);
        if (versBillet(statutSuivant)) return;
      }

      setStatut(paiement.status);
      if (paiement.status === "ECHOUE") {
        setErreur("Le paiement a été refusé par l'opérateur. Vos sièges ont été libérés.");
      } else if (paiement.status === "INDETERMINE") {
        setErreur(
          "L'opérateur n'a pas répondu. Vos sièges restent bloqués et notre équipe vérifie la " +
            "transaction : vous serez contacté par SMS. Aucun second paiement n'est nécessaire.",
        );
      }
    } catch (error) {
      setErreur((error as Error).message);
    } finally {
      setOccupe(false);
    }
  };

  return (
    <Card title="Paiement Mobile Money">
      {erreur && (
        <p
          role="alert"
          className="mb-4 rounded-[10px] border border-alerte/40 bg-alerte-doux px-3 py-2 text-sm text-alerte"
        >
          {erreur}
        </p>
      )}

      <Field label="Opérateur">
        <select
          className={inputClass}
          value={operateur}
          disabled={occupe}
          onChange={(e) => setOperateur(e.target.value as PaymentProviderId)}
        >
          {MOBILE_MONEY_PROVIDERS.map((id) => (
            <option key={id} value={id}>
              {PROVIDER_LABELS[id]}
            </option>
          ))}
        </select>
      </Field>

      <button type="button" className={`${buttonClass} mt-4 w-full`} disabled={occupe} onClick={payer}>
        {occupe ? "Paiement en cours…" : `Payer avec ${PROVIDER_LABELS[operateur]} (${devise})`}
      </button>

      {statut === "INITIE" && (
        <p className="mt-3 rounded-lg border border-attention/40 bg-attention-doux px-3 py-2 text-sm text-attention">
          Composez le code de confirmation sur votre téléphone et saisissez votre PIN. Nous
          attendons la réponse de l&apos;opérateur — ne fermez pas cette page.
        </p>
      )}

      <div className="mt-3">
        <Why>
          Votre code secret Mobile Money n&apos;est jamais saisi ici, ni stocké, ni transmis à
          Mobembo. Il reste entre vous et votre opérateur.
        </Why>
      </div>
    </Card>
  );
}
