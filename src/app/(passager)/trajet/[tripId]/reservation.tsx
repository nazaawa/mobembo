"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SeatMap, type SeatView } from "@/components/seat-map";
import {
  Card,
  Field,
  Why,
  inputClass,
  buttonClass,
  buttonSecondaryClass,
  Money,
} from "@/components/ui";
import { MOBILE_MONEY_PROVIDERS, PROVIDER_LABELS } from "@/lib/domain/types";
import type { Currency } from "@/lib/core/money";
import type { PaymentProviderId } from "@/lib/domain/types";

type Etape = "SIEGES" | "IDENTITE" | "PAIEMENT";

interface Passager {
  seatNumber: string;
  name: string;
  phone: string;
}

/**
 * Tunnel de réservation §2.5 : sièges → verrou 7 min → identité (OTP) →
 * paiement Mobile Money → billet.
 *
 * Le compte à rebours est affiché en permanence : un passager qui ne voit pas
 * son verrou expirer croit avoir perdu son siège par la faute du système.
 */
export function Reservation({
  tripId,
  rows,
  layoutColumns,
  seats,
  prixUsd,
  prixCdf,
  placesRestantes,
}: {
  tripId: string;
  rows: number;
  layoutColumns: string[];
  seats: SeatView[];
  prixUsd: number;
  prixCdf: number;
  placesRestantes: number;
}) {
  const router = useRouter();
  const [etape, setEtape] = useState<Etape>("SIEGES");
  const [selection, setSelection] = useState<string[]>([]);
  const [holdId, setHoldId] = useState<string | null>(null);
  const [expiration, setExpiration] = useState<string | null>(null);
  const [restant, setRestant] = useState(0);

  const [telephone, setTelephone] = useState("");
  const [nom, setNom] = useState("");
  const [codeOtp, setCodeOtp] = useState("");
  const [otpEnvoye, setOtpEnvoye] = useState(false);
  const [codeDemo, setCodeDemo] = useState<string | null>(null);
  const [passagers, setPassagers] = useState<Passager[]>([]);

  const [devise, setDevise] = useState<Currency>("USD");
  const [operateur, setOperateur] = useState<PaymentProviderId>("MPESA");
  const [reservationId, setReservationId] = useState<string | null>(null);
  const [statutPaiement, setStatutPaiement] = useState<string | null>(null);

  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const prixUnitaire = devise === "USD" ? prixUsd : prixCdf;
  const total = prixUnitaire * Math.max(selection.length, 1);

  // Compte à rebours du verrou (§2.5 : 7 minutes).
  useEffect(() => {
    if (!expiration) return;
    const tick = () => {
      const secondes = Math.max(
        0,
        Math.floor((new Date(expiration).getTime() - Date.now()) / 1000),
      );
      setRestant(secondes);
      if (secondes === 0) {
        setErreur("Votre maintien de siège a expiré. Reprenez la sélection.");
        setEtape("SIEGES");
        setHoldId(null);
        setExpiration(null);
        router.refresh();
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [expiration, router]);

  const minutes = Math.floor(restant / 60);
  const secondes = restant % 60;

  const appel = async <T,>(url: string, init?: RequestInit): Promise<T> => {
    const response = await fetch(url, {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message ?? "Erreur inattendue.");
    return data as T;
  };

  const maintenir = async () => {
    setErreur(null);
    setOccupe(true);
    try {
      const data = await appel<{ holdId: string; verrouJusqua: string }>(
        "/api/reservations/maintien",
        { method: "POST", body: JSON.stringify({ tripId, sieges: selection }) },
      );
      setHoldId(data.holdId);
      setExpiration(data.verrouJusqua);
      setPassagers(selection.map((seatNumber) => ({ seatNumber, name: "", phone: "" })));
      setEtape("IDENTITE");
    } catch (error) {
      setErreur((error as Error).message);
      router.refresh();
    } finally {
      setOccupe(false);
    }
  };

  const demanderOtp = async () => {
    setErreur(null);
    setOccupe(true);
    try {
      const data = await appel<{ codeDeveloppement?: string }>("/api/auth/otp/demande", {
        method: "POST",
        body: JSON.stringify({ phone: telephone }),
      });
      setOtpEnvoye(true);
      setCodeDemo(data.codeDeveloppement ?? null);
    } catch (error) {
      setErreur((error as Error).message);
    } finally {
      setOccupe(false);
    }
  };

  const confirmerIdentite = async () => {
    setErreur(null);
    setOccupe(true);
    try {
      await appel("/api/auth/otp/verification", {
        method: "POST",
        body: JSON.stringify({ phone: telephone, code: codeOtp, name: nom }),
      });
      const data = await appel<{ reservation: { id: string } }>("/api/reservations", {
        method: "POST",
        body: JSON.stringify({
          tripId,
          holdId,
          telephone,
          nom,
          devise,
          passagers: passagers.map((p) => ({
            seatNumber: p.seatNumber,
            name: p.name.trim() || nom,
            phone: p.phone.trim() || telephone,
          })),
        }),
      });
      setReservationId(data.reservation.id);
      setEtape("PAIEMENT");
    } catch (error) {
      setErreur((error as Error).message);
    } finally {
      setOccupe(false);
    }
  };

  const payer = async () => {
    if (!reservationId) return;
    setErreur(null);
    setOccupe(true);
    setStatutPaiement("INITIE");
    try {
      // La clé d'idempotence est stable pour cette réservation : un double clic
      // retombe sur le même paiement, jamais sur un second débit (§3.2).
      const cleIdempotence = `${reservationId}:${operateur}`;
      const init = await appel<{
        paiement: { id: string; status: string };
        verrouJusqua: string;
      }>("/api/paiements", {
        method: "POST",
        body: JSON.stringify({
          reservationId,
          operateur,
          telephone,
          cleIdempotence,
        }),
      });
      if (init.verrouJusqua) setExpiration(init.verrouJusqua);

      // Polling de secours : toutes les 30 s pendant 5 min (§3.2). Ici toutes
      // les 3 s pour que l'attente reste supportable à l'écran, le serveur
      // n'interrogeant réellement l'opérateur qu'à chaque appel.
      let paiement = init.paiement;
      for (let essai = 0; essai < 60 && paiement.status === "INITIE"; essai++) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
        const statut = await appel<{
          paiement: { id: string; status: string };
          billets: Array<{ id: string }>;
        }>(`/api/paiements/${paiement.id}/statut`);
        paiement = statut.paiement;
        setStatutPaiement(paiement.status);
        if (paiement.status === "CONFIRME" && statut.billets[0]) {
          router.push(`/billet/${statut.billets[0].id}`);
          return;
        }
      }
      setStatutPaiement(paiement.status);
      if (paiement.status === "ECHOUE") {
        setErreur("Le paiement a été refusé par l'opérateur. Votre siège a été libéré.");
      } else if (paiement.status === "INDETERMINE") {
        setErreur(
          "L'opérateur n'a pas répondu. Votre siège reste bloqué et notre équipe vérifie la " +
            "transaction : vous serez contacté par SMS. Aucun second paiement n'est nécessaire.",
        );
      }
    } catch (error) {
      setErreur((error as Error).message);
    } finally {
      setOccupe(false);
    }
  };

  const compteARebours = expiration && (
    <div
      className={`rounded-lg border px-3 py-2 text-sm ${
        restant < 60
          ? "border-alerte/40 bg-alerte-doux text-alerte"
          : "border-attention/40 bg-attention-doux text-attention"
      }`}
      role="status"
    >
      Siège maintenu encore{" "}
      <strong className="tabular-nums">
        {minutes}:{String(secondes).padStart(2, "0")}
      </strong>
      {restant < 60 && " — terminez votre paiement."}
    </div>
  );

  return (
    <div className="space-y-4">
      {erreur && (
        <p className="rounded-lg border border-alerte/40 bg-alerte-doux px-3 py-2 text-sm text-alerte">
          {erreur}
        </p>
      )}
      {compteARebours}

      {etape === "SIEGES" && (
        <Card
          title="Choisissez votre siège"
          subtitle={`${placesRestantes} place(s) disponibles en ligne sur ce départ`}
        >
          <SeatMap
            layoutColumns={layoutColumns}
            rows={rows}
            seats={seats}
            channel="EN_LIGNE"
            selected={selection}
            onToggle={(seat) =>
              setSelection((current) =>
                current.includes(seat)
                  ? current.filter((s) => s !== seat)
                  : current.length >= 3
                    ? current
                    : [...current, seat],
              )
            }
          />
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm">
              {selection.length === 0 ? (
                <span className="text-texte-doux">Aucun siège sélectionné</span>
              ) : (
                <>
                  <strong>{selection.join(", ")}</strong>{" "}
                  <span className="text-texte-doux">
                    — <Money amount={prixUnitaire * selection.length} currency={devise} />
                  </span>
                </>
              )}
            </div>
            <button
              type="button"
              className={buttonClass}
              disabled={selection.length === 0 || occupe}
              onClick={maintenir}
            >
              {occupe ? "…" : "Maintenir ces sièges 7 minutes"}
            </button>
          </div>
          <div className="mt-3">
            <Why>
              Sept minutes, et non cinq&nbsp;: un paiement Mobile Money demande de saisir un PIN et
              d&apos;attendre la confirmation de l&apos;opérateur. Un délai trop court ferait
              perdre le siège à des passagers qui ont pourtant payé. Trois sièges au maximum par
              numéro.
            </Why>
          </div>
        </Card>
      )}

      {etape === "IDENTITE" && (
        <Card
          title="Qui voyage ?"
          subtitle="Aucun mot de passe : nous vous envoyons un code par SMS."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Votre téléphone" hint="Format RDC, ex. 081 234 5678">
              <input
                className={inputClass}
                inputMode="tel"
                value={telephone}
                onChange={(e) => setTelephone(e.target.value)}
                placeholder="081 234 5678"
              />
            </Field>
            <Field label="Votre nom">
              <input
                className={inputClass}
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                placeholder="Nom et prénom"
              />
            </Field>
          </div>

          {passagers.length > 1 && (
            <div className="mt-4 space-y-3">
              <p className="text-xs text-texte-doux">
                Réservation de groupe : chaque billet porte son propre passager et son propre QR.
              </p>
              {passagers.map((passager, index) => (
                <div key={passager.seatNumber} className="grid gap-3 sm:grid-cols-2">
                  <Field label={`Siège ${passager.seatNumber} — nom`}>
                    <input
                      className={inputClass}
                      value={passager.name}
                      placeholder={index === 0 ? "Vous-même" : "Nom du passager"}
                      onChange={(e) =>
                        setPassagers((current) =>
                          current.map((p, i) =>
                            i === index ? { ...p, name: e.target.value } : p,
                          ),
                        )
                      }
                    />
                  </Field>
                  <Field label="Téléphone (facultatif)">
                    <input
                      className={inputClass}
                      inputMode="tel"
                      value={passager.phone}
                      onChange={(e) =>
                        setPassagers((current) =>
                          current.map((p, i) =>
                            i === index ? { ...p, phone: e.target.value } : p,
                          ),
                        )
                      }
                    />
                  </Field>
                </div>
              ))}
            </div>
          )}

          {!otpEnvoye ? (
            <button
              type="button"
              className={`${buttonClass} mt-4`}
              disabled={!telephone || !nom || occupe}
              onClick={demanderOtp}
            >
              Recevoir mon code par SMS
            </button>
          ) : (
            <div className="mt-4 space-y-3">
              <Field
                label="Code reçu par SMS"
                hint={codeDemo ? `Environnement de démonstration — code : ${codeDemo}` : undefined}
              >
                <input
                  className={`${inputClass} tracking-[0.4em]`}
                  inputMode="numeric"
                  maxLength={6}
                  value={codeOtp}
                  onChange={(e) => setCodeOtp(e.target.value.replace(/\D/g, ""))}
                  placeholder="000000"
                />
              </Field>
              <div className="flex gap-2">
                <button
                  type="button"
                  className={buttonClass}
                  disabled={codeOtp.length < 6 || occupe}
                  onClick={confirmerIdentite}
                >
                  Confirmer et payer
                </button>
                <button type="button" className={buttonSecondaryClass} onClick={demanderOtp}>
                  Renvoyer le code
                </button>
              </div>
            </div>
          )}
        </Card>
      )}

      {etape === "PAIEMENT" && (
        <Card title="Paiement Mobile Money">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Devise">
              <select
                className={inputClass}
                value={devise}
                onChange={(e) => setDevise(e.target.value as Currency)}
                disabled={Boolean(reservationId)}
              >
                <option value="USD">Dollar américain (USD)</option>
                <option value="CDF">Franc congolais (CDF)</option>
              </select>
            </Field>
            <Field label="Opérateur">
              <select
                className={inputClass}
                value={operateur}
                onChange={(e) => setOperateur(e.target.value as PaymentProviderId)}
              >
                {MOBILE_MONEY_PROVIDERS.map((id) => (
                  <option key={id} value={id}>
                    {PROVIDER_LABELS[id]}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <dl className="mt-4 space-y-1 rounded-lg bg-surface-alt px-3 py-2.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-texte-doux">Sièges</dt>
              <dd>{selection.join(", ")}</dd>
            </div>
            <div className="flex justify-between font-semibold">
              <dt>Total à payer</dt>
              <dd>
                <Money amount={total} currency={devise} />
              </dd>
            </div>
          </dl>

          <button
            type="button"
            className={`${buttonClass} mt-4 w-full`}
            disabled={occupe}
            onClick={payer}
          >
            {occupe ? "Paiement en cours…" : `Payer avec ${PROVIDER_LABELS[operateur]}`}
          </button>

          {statutPaiement === "INITIE" && (
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
      )}
    </div>
  );
}
