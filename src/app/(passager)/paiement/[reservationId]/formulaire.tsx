"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { formatMoney, type Currency } from "@/lib/core/money";
import { MOBILE_MONEY_PROVIDERS, PROVIDER_LABELS, type PaymentProviderId } from "@/lib/domain/types";

interface Devis {
  prixUnitaire: number;
  places: number;
  sousTotal: number;
  frais: number;
  total: number;
  devise: Currency;
}

type Etape = "CHOIX" | "ATTENTE" | "ECHEC" | "INDETERMINE";

/**
 * §14.1 — le récapitulatif avant le débit, dans l'ordre exact de la note :
 * prix du billet, nombre de places, montant total, frais, montant final.
 *
 * §3.3 : aucun PIN ne transite par Mobembo. Le voyageur le saisit sur son
 * téléphone, dans le canal USSD de l'opérateur — l'écran le dit, parce qu'un
 * formulaire de paiement qui ne demande pas de code inquiète tant qu'on n'a pas
 * expliqué pourquoi.
 */
export function FormulairePaiement({
  reservationId,
  reference,
  compagnie,
  devis,
  telephone,
  cleIdempotence,
}: {
  reservationId: string;
  reference: string;
  compagnie: string;
  devis: Devis;
  telephone: string;
  /**
   * §3.2 : « Un double clic ne débite jamais deux fois. » La clé est tirée par
   * le serveur, une fois par chargement d'écran : réessayer après un échec
   * réutilise la même, et l'opérateur reconnaît la tentative au lieu d'en
   * ouvrir une seconde. Un rendu client, lui, doit rester pur.
   */
  cleIdempotence: string;
}) {
  const router = useRouter();
  const [operateur, setOperateur] = useState<PaymentProviderId>(MOBILE_MONEY_PROVIDERS[0]);
  const [payeur, setPayeur] = useState(telephone);
  const [etape, setEtape] = useState<Etape>("CHOIX");
  const [erreur, setErreur] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [paiementId, setPaiementId] = useState<string | null>(null);

  // Interrogation de secours quand aucun webhook n'arrive (§3.2).
  useEffect(() => {
    if (etape !== "ATTENTE" || !paiementId) return;
    const timer = setInterval(async () => {
      try {
        const response = await fetch(`/api/paiements-reservation/${paiementId}/statut`, {
          method: "POST",
        });
        const data = await response.json();
        if (!response.ok) return;
        if (data.billet) {
          router.replace(`/billet-reservation/${data.billet.id}`);
          return;
        }
        if (data.paiement?.status === "ECHOUE") setEtape("ECHEC");
        if (data.paiement?.status === "INDETERMINE") setEtape("INDETERMINE");
      } catch {
        // Réseau instable : on retentera au tick suivant, sans rien casser.
      }
    }, 4000);
    return () => clearInterval(timer);
  }, [etape, paiementId, router]);

  const payer = async () => {
    setErreur(null);
    setOccupe(true);
    try {
      const response = await fetch(`/api/reservations-horaire/${reservationId}/paiement`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          operateur,
          telephone: payeur,
          cleIdempotence,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Paiement impossible.");

      if (data.ticket) {
        router.replace(`/billet-reservation/${data.ticket.id}`);
        return;
      }
      setPaiementId(data.payment.id);
      setEtape(data.payment.status === "ECHOUE" ? "ECHEC" : "ATTENTE");
    } catch (error) {
      setErreur((error as Error).message);
    } finally {
      setOccupe(false);
    }
  };

  return (
    <div className="mt-8 space-y-5">
      <section
        aria-labelledby="recapitulatif"
        className="rounded-[14px] border border-bordure bg-surface p-5"
      >
        <h2 id="recapitulatif" className="font-heading text-lg font-bold text-navy">
          Ce que vous payez
        </h2>
        <dl className="mt-4 divide-y divide-bordure text-sm">
          <Ligne label="Prix du billet">{formatMoney(devis.prixUnitaire, devis.devise)}</Ligne>
          <Ligne label="Nombre de places">{devis.places}</Ligne>
          <Ligne label="Montant total">{formatMoney(devis.sousTotal, devis.devise)}</Ligne>
          <Ligne label="Frais de service">
            {devis.frais === 0 ? "Aucun" : formatMoney(devis.frais, devis.devise)}
          </Ligne>
        </dl>
        <div className="mt-4 flex items-baseline justify-between border-t-2 border-navy pt-4">
          <span className="font-semibold text-navy">Montant final à payer</span>
          <span className="font-heading text-2xl font-bold tabular-nums text-navy">
            {formatMoney(devis.total, devis.devise)}
          </span>
        </div>
        <p className="mt-3 text-xs leading-5 text-texte-doux">
          Mobembo n’ajoute aucun frais au voyageur. Le prix est celui annoncé par {compagnie}.
        </p>
      </section>

      {erreur && (
        <p role="alert" className="rounded-[10px] border border-alerte/40 bg-alerte-doux px-4 py-3 text-sm leading-6 text-alerte">
          {erreur}
        </p>
      )}

      {etape === "ATTENTE" && (
        <section
          role="status"
          className="rounded-[14px] border border-accent/30 bg-accent-doux p-5 text-center"
        >
          <span className="mx-auto block h-8 w-8 animate-spin rounded-full border-[3px] border-accent/25 border-t-accent motion-reduce:animate-none" aria-hidden />
          <h2 className="mt-4 font-heading text-xl font-bold text-navy">
            Validez sur votre téléphone
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-texte">
            {PROVIDER_LABELS[operateur]} vient d’envoyer une demande de confirmation au {payeur}.
            Saisissez votre code secret sur votre téléphone — Mobembo ne le voit jamais.
          </p>
          <p className="mt-3 text-xs text-texte-doux">
            Cet écran se met à jour tout seul. Ne fermez pas la page.
          </p>
        </section>
      )}

      {etape === "INDETERMINE" && (
        <section className="rounded-[14px] border border-attention/30 bg-attention-doux p-5">
          <h2 className="font-heading text-xl font-bold text-attention">Réponse non reçue</h2>
          <p className="mt-2 text-sm leading-6 text-texte">
            L’opérateur n’a pas répondu dans les cinq minutes. Nous ne devinons pas à sa place :
            l’équipe Mobembo vérifie et vous recontacte. Votre place reste réservée sous la référence{" "}
            <span className="font-mono font-bold text-navy">{reference}</span>.
          </p>
          <p className="mt-2 text-sm leading-6 text-texte-doux">
            Si votre compte a été débité, vous n’avez rien à faire. Sinon, vous pourrez payer à
            l’agence au départ.
          </p>
        </section>
      )}

      {(etape === "CHOIX" || etape === "ECHEC") && (
        <form
          className="rounded-[14px] border border-bordure bg-surface p-5"
          onSubmit={(event) => {
            event.preventDefault();
            payer();
          }}
        >
          <h2 className="font-heading text-lg font-bold text-navy">Moyen de paiement</h2>

          {etape === "ECHEC" && (
            <p role="alert" className="mt-3 rounded-[10px] bg-alerte-doux px-3 py-2.5 text-sm leading-6 text-alerte">
              Le paiement n’a pas abouti. Votre place reste réservée : réessayez, ou réglez à
              l’agence au départ.
            </p>
          )}

          <fieldset className="mt-4">
            <legend className="sr-only">Opérateur Mobile Money</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {MOBILE_MONEY_PROVIDERS.map((id) => (
                <label
                  key={id}
                  className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-[10px] border px-3.5 text-sm font-semibold transition ${
                    operateur === id
                      ? "border-accent bg-accent-doux text-accent"
                      : "border-bordure bg-surface text-navy hover:border-accent"
                  }`}
                >
                  <input
                    type="radio"
                    name="operateur"
                    value={id}
                    checked={operateur === id}
                    onChange={() => setOperateur(id)}
                    className="champ-coche"
                  />
                  {PROVIDER_LABELS[id]}
                </label>
              ))}
            </div>
          </fieldset>

          <label className="mt-4 block">
            <span className="mb-1.5 block text-xs font-semibold text-texte-doux">
              Numéro à débiter
            </span>
            <input
              required
              type="tel"
              inputMode="tel"
              value={payeur}
              onChange={(event) => setPayeur(event.target.value)}
              className="h-12 w-full rounded-[10px] bg-surface-alt px-3.5 text-base font-medium text-texte outline outline-1 outline-transparent transition focus:bg-surface focus:outline-accent"
            />
            <span className="mt-1 block text-[11px] text-texte-doux">
              Le compte Mobile Money qui règle le billet. Il peut différer du numéro de réservation.
            </span>
          </label>

          <button
            type="submit"
            disabled={occupe || payeur.trim().length < 9}
            className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[10px] bg-accent px-5 text-sm font-bold text-white transition duration-300 ease-depart hover:-translate-y-0.5 hover:bg-accent-profond disabled:cursor-not-allowed disabled:translate-y-0 disabled:bg-bordure disabled:text-texte-doux"
          >
            {occupe
              ? "Envoi de la demande…"
              : `Payer ${formatMoney(devis.total, devis.devise)}`}
          </button>

          <p className="mt-3 text-[11px] leading-5 text-texte-doux">
            Aucun code secret n’est saisi ici. Vous le tapez sur votre téléphone, dans la fenêtre de
            votre opérateur. Votre billet numérique est émis dès la confirmation.
          </p>
        </form>
      )}
    </div>
  );
}

function Ligne({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="text-texte-doux">{label}</dt>
      <dd className="font-semibold tabular-nums text-navy">{children}</dd>
    </div>
  );
}
