"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ReservationView } from "@/lib/domain/reservations";
import { formatDateTime, formatDay, formatTime } from "@/lib/core/time";
import { formatMoney } from "@/lib/core/money";
import { Badge, Table, inputClass } from "@/components/ui";

/**
 * §11.2 : voyage, passager, nombre de places, statut, date de réservation.
 * Le numéro du passager est affiché en clair et sélectionnable : c'est avec
 * lui que l'agence rappelle quelqu'un qui n'est pas au départ.
 */
export function ListeReservations({ reservations }: { reservations: ReservationView[] }) {
  const router = useRouter();
  const [annulation, setAnnulation] = useState<{ id: string; motif: string } | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);

  const annuler = async (id: string, motif: string) => {
    setErreur(null);
    setOccupe(true);
    try {
      const response = await fetch(`/api/reservations-horaire/${id}/annulation`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ motif }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Annulation impossible.");
      setAnnulation(null);
      router.refresh();
    } catch (error) {
      setErreur((error as Error).message);
    } finally {
      setOccupe(false);
    }
  };

  return (
    <div className="space-y-3">
      {erreur && (
        <p role="alert" className="rounded-lg border border-alerte/40 bg-alerte-doux px-3 py-2 text-sm text-alerte">
          {erreur}
        </p>
      )}

      <Table headers={["Départ", "Passager", "Places", "Référence", "Réservée le", "Statut", ""]}>
        {reservations.map((reservation) => (
          <tr key={reservation.id} className="align-top hover:bg-surface-alt">
            <td className="px-2 py-2">
              <span className="font-medium">
                {reservation.origin_city} → {reservation.destination_city}
              </span>
              <span className="block text-[11px] text-texte-doux">
                {formatDay(reservation.travel_date)} · {formatTime(reservation.departure_at)}
              </span>
            </td>

            <td className="px-2 py-2">
              <span className="font-medium">{reservation.passenger_name}</span>
              <a
                href={`tel:${reservation.passenger_phone}`}
                className="block select-all text-[11px] tabular-nums text-accent hover:underline"
              >
                {reservation.passenger_phone}
              </a>
              {reservation.note && (
                <span className="mt-0.5 block text-[11px] text-texte-doux">{reservation.note}</span>
              )}
            </td>

            <td className="px-2 py-2 tabular-nums">
              {reservation.seats}
              {(reservation.price_usd !== null || reservation.price_cdf !== null) && (
                <span className="block text-[11px] text-texte-doux">
                  {reservation.price_usd !== null
                    ? formatMoney(reservation.price_usd * reservation.seats, "USD")
                    : formatMoney(reservation.price_cdf! * reservation.seats, "CDF")}{" "}
                  à encaisser
                </span>
              )}
            </td>

            <td className="px-2 py-2 font-mono text-xs">{reservation.reference}</td>

            <td className="whitespace-nowrap px-2 py-2 text-[11px] text-texte-doux">
              {formatDateTime(reservation.created_at)}
            </td>

            <td className="px-2 py-2">
              {reservation.status === "CONFIRMEE" && <Badge tone="succes">Confirmée</Badge>}
              {reservation.status === "TERMINEE" && <Badge tone="neutre">Voyage passé</Badge>}
              {reservation.status === "ANNULEE" && (
                <>
                  <Badge tone="alerte">
                    Annulée {reservation.cancelled_by === "AGENCE" ? "· agence" : "· voyageur"}
                  </Badge>
                  {reservation.cancel_reason && (
                    <span className="mt-1 block max-w-40 text-[11px] text-texte-doux">
                      {reservation.cancel_reason}
                    </span>
                  )}
                </>
              )}
            </td>

            <td className="px-2 py-2 text-right">
              {reservation.status === "CONFIRMEE" &&
                (annulation?.id === reservation.id ? (
                  <div className="rounded-lg border border-alerte/30 bg-alerte-doux p-2.5 text-left">
                    <label className="block text-[11px] font-semibold text-alerte">
                      Motif envoyé au voyageur par SMS
                      <input
                        autoFocus
                        className={`${inputClass} mt-1`}
                        value={annulation.motif}
                        onChange={(event) =>
                          setAnnulation({ id: reservation.id, motif: event.target.value })
                        }
                        placeholder="Départ complet, véhicule immobilisé…"
                      />
                    </label>
                    <div className="mt-2 flex gap-1.5">
                      <button
                        type="button"
                        disabled={occupe || !annulation.motif.trim()}
                        onClick={() => annuler(reservation.id, annulation.motif)}
                        className="rounded-lg bg-alerte px-3 py-1.5 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
                      >
                        {occupe ? "Annulation…" : "Annuler et prévenir"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setAnnulation(null)}
                        className="rounded-lg border border-bordure bg-surface px-3 py-1.5 text-xs font-medium transition hover:bg-surface-alt"
                      >
                        Retour
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAnnulation({ id: reservation.id, motif: "" })}
                    className="rounded-lg border border-bordure px-3 py-1.5 text-xs font-medium text-texte-doux transition hover:border-alerte hover:text-alerte"
                  >
                    Annuler
                  </button>
                ))}
            </td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
