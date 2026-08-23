import { knownCities } from "@/lib/domain/planning";
import { SearchForm } from "./search-form";
import { Card, Why } from "@/components/ui";

export const dynamic = "force-dynamic";

/** §2.5.1 Recherche — ville de départ, ville d'arrivée, date. */
export default async function AccueilPassager() {
  const villes = knownCities();
  const aujourdhui = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Où allez-vous&nbsp;?</h1>
        <p className="mt-1 text-sm text-texte-doux">
          Réservez votre siège, payez en Mobile Money, embarquez avec votre QR.
        </p>
      </div>

      <Card>
        <SearchForm villes={villes} defaultDate={aujourdhui} />
      </Card>

      <Card title="Ce que garantit votre réservation">
        <ul className="space-y-2.5 text-sm">
          <li className="flex gap-2">
            <span aria-hidden className="text-accent">
              ●
            </span>
            <span>
              <strong>Votre siège est à vous.</strong> Il est bloqué dans le système dès le
              paiement : personne ne peut le revendre au guichet.
            </span>
          </li>
          <li className="flex gap-2">
            <span aria-hidden className="text-accent">
              ●
            </span>
            <span>
              <strong>Un SMS, toujours.</strong> Votre code, votre siège et votre heure vous sont
              envoyés par SMS — même si vous changez ou rechargez votre téléphone.
            </span>
          </li>
          <li className="flex gap-2">
            <span aria-hidden className="text-accent">
              ●
            </span>
            <span>
              <strong>Un empêchement&nbsp;?</strong> Transférez votre billet à un proche
              gratuitement, ou remettez-le en vente et récupérez 90&nbsp;% du prix.
            </span>
          </li>
        </ul>
        <div className="mt-4">
          <Why>
            Un remboursement Mobile Money coûte cher et prend du temps. Revendre votre siège ne
            coûte rien à personne et remplit le bus : c&apos;est pourquoi vous y récupérez plus
            qu&apos;en annulant.
          </Why>
        </div>
      </Card>
    </div>
  );
}
