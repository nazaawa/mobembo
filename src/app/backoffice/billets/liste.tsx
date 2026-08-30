"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CompanyTicketRow } from "@/lib/domain/reservation-payments";
import { formatDay, formatTime } from "@/lib/core/time";
import { formatMoney } from "@/lib/core/money";
import { PROVIDER_LABELS } from "@/lib/domain/types";
import { Badge, Table } from "@/components/ui";

const STATUT_BILLET = {
  VALIDE: { label: "À venir", tone: "succes" },
  UTILISE: { label: "Contrôlé", tone: "accent" },
  ANNULE: { label: "Annulé", tone: "alerte" },
  EXPIRE: { label: "Expiré", tone: "neutre" },
} as const;

/**
 * §15 : voyageurs attendus, statut des paiements, billets annulés et contrôlés,
 * dans une seule liste triée par départ. Le numéro du passager reste en clair et
 * cliquable : c'est avec lui que l'agence rappelle quelqu'un qui n'est pas là.
 */
export function ListeBillets({ billets }: { billets: CompanyTicketRow[] }) {
  const router = useRouter();
  const [occupe, setOccupe] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const declarerRembourse = async (paiementId: string) => {
    setErreur(null);
    setOccupe(paiementId);
    try {
      const response = await fetch("/api/backoffice/remboursements", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ paiementId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Déclaration impossible.");
      router.refresh();
    } catch (error) {
      setErreur((error as Error).message);
    } finally {
      setOccupe(null);
    }
  };

  return (
    <div className="space-y-3">
      {erreur && (
        <p role="alert" className="rounded-lg border border-alerte/40 bg-alerte-doux px-3 py-2 text-sm text-alerte">
          {erreur}
        </p>
      )}

      <Table headers={["Départ", "Passager", "Billet", "Encaissé", "Paiement", "État", ""]}>
        {billets.map((billet) => {
          const statut = STATUT_BILLET[billet.status];
          const aRembourser = billet.payment_status === "A_REMBOURSER";
          return (
            <tr key={billet.id} className="align-top hover:bg-surface-alt">
              <td className="px-2 py-2">
                <span className="font-medium">
                  {billet.origin_city} → {billet.destination_city}
                </span>
                <span className="block text-[11px] text-texte-doux">
                  {formatDay(billet.travel_date)} · {formatTime(billet.departure_at)}
                </span>
              </td>

              <td className="px-2 py-2">
                <span className="font-medium">{billet.passenger_name}</span>
                <a
                  href={`tel:${billet.passenger_phone}`}
                  className="block select-all text-[11px] tabular-nums text-accent hover:underline"
                >
                  {billet.passenger_phone}
                </a>
              </td>

              <td className="px-2 py-2">
                <span className="font-mono text-xs">{billet.ticket_code}</span>
                <span className="block text-[11px] text-texte-doux">
                  {billet.seats} place{billet.seats > 1 ? "s" : ""} · réf. {billet.reference}
                </span>
              </td>

              <td className="px-2 py-2 tabular-nums">
                {formatMoney(billet.paid_amount, billet.paid_currency)}
              </td>

              <td className="px-2 py-2">
                {billet.payment_provider ? (
                  <span className="text-xs">{PROVIDER_LABELS[billet.payment_provider]}</span>
                ) : (
                  <span className="text-xs text-texte-doux">—</span>
                )}
                <span className="block text-[11px] text-texte-doux">
                  {billet.payment_status === "CONFIRME"
                    ? "confirmé"
                    : billet.payment_status === "A_REMBOURSER"
                      ? "à rembourser"
                      : billet.payment_status === "REMBOURSE"
                        ? "remboursé"
                        : (billet.payment_status ?? "—").toLowerCase()}
                </span>
              </td>

              <td className="px-2 py-2">
                <Badge tone={statut.tone}>{statut.label}</Badge>
              </td>

              <td className="px-2 py-2 text-right">
                {aRembourser && billet.payment_id_ref && (
                  <button
                    type="button"
                    disabled={occupe === billet.payment_id_ref}
                    onClick={() => declarerRembourse(billet.payment_id_ref!)}
                    className="rounded-lg border border-bordure px-3 py-1.5 text-xs font-semibold text-navy transition hover:border-succes hover:text-succes disabled:opacity-50"
                  >
                    {occupe === billet.payment_id_ref ? "…" : "Remboursement effectué"}
                  </button>
                )}
              </td>
            </tr>
          );
        })}
      </Table>
    </div>
  );
}
