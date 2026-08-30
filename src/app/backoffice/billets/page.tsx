import Link from "next/link";
import { redirect } from "next/navigation";
import { currentSession } from "@/lib/auth/session";
import { companyAccess, hasModule } from "@/lib/domain/access";
import { ModuleFerme } from "@/components/module-ferme";
import { companyTickets, expirePastTickets, ticketingSummary } from "@/lib/domain/reservation-payments";
import { formatMoney } from "@/lib/core/money";
import { Card, Empty, Stat, Why } from "@/components/ui";
import { ListeBillets } from "./liste";

export const dynamic = "force-dynamic";

/**
 * §15 — ce que l'agence voit de sa phase 3 : billets vendus, montants
 * encaissés, voyageurs attendus, statut des paiements, billets annulés,
 * billets contrôlés.
 *
 * Les montants affichés sont ceux encaissés par Mobembo. La commission de §17
 * y est rappelée à côté, parce qu'une recette brute qui ne dit pas ce qui sera
 * retenu n'est pas une information utilisable pour une agence.
 */
export default async function BilletsAgence() {
  const session = await currentSession();
  // Le layout et la page rendent en parallèle : le `redirect()` du layout
  // n'empêche pas cette fonction de s'exécuter. Sans cette garde, une session
  // expirée produit une exception au lieu d'une redirection propre.
  if (!session?.companyId) redirect("/guichet/connexion");
  const companyId = session!.companyId!;
  const acces = await companyAccess(companyId);
  if (!hasModule(acces, "PAIEMENT")) return <ModuleFerme module="PAIEMENT" />;

  await expirePastTickets();
  const [resume, billets] = await Promise.all([
    ticketingSummary(companyId),
    companyTickets(companyId),
  ]);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Paiements et billets</h1>
        <p className="mt-1 text-sm text-texte-doux">
          Réservations payées en ligne par Mobile Money. Le billet numérique est émis dès la
          confirmation du paiement.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Billets vendus"
          value={resume.billetsVendus}
          hint={`${resume.placesVendues} place(s)`}
        />
        <Stat
          label="Encaissé en ligne"
          value={formatMoney(resume.encaisseUsd, "USD")}
          hint={
            resume.encaisseCdf > 0
              ? `${formatMoney(resume.encaisseCdf, "CDF")} également`
              : `dont ${formatMoney(resume.commissionUsd, "USD")} de commission Mobembo`
          }
        />
        <Stat
          label="Paiements en cours"
          value={resume.enAttente}
          hint="en attente de réponse opérateur"
          tone={resume.enAttente > 0 ? "attention" : "neutre"}
        />
        <Stat
          label="Remboursements à traiter"
          value={resume.remboursementsATraiter}
          tone={resume.remboursementsATraiter > 0 ? "alerte" : "neutre"}
          hint="billets annulés après paiement"
        />
      </div>

      <Card
        title="Billets émis"
        subtitle={`${resume.billetsControles} contrôlé(s) · ${resume.billetsAnnules} annulé(s)`}
      >
        {billets.length === 0 ? (
          <Empty>
            Aucun billet payé en ligne pour l&apos;instant. Vos départs ouverts à la réservation
            apparaissent dans{" "}
            <Link href="/backoffice/reservations" className="text-accent hover:underline">
              Réservations
            </Link>
            .
          </Empty>
        ) : (
          <ListeBillets billets={billets} />
        )}
        <div className="mt-4">
          <Why>
            Un billet n&apos;existe qu&apos;après confirmation du paiement par l&apos;opérateur : un
            paiement échoué ne laisse aucun billet valide derrière lui, seulement la réservation, que
            le voyageur peut encore régler chez vous. Un billet annulé après paiement sort de la
            liste des voyageurs attendus et entre dans la file des remboursements — que vous traitez
            par votre propre canal, puis déclarez ici.
          </Why>
        </div>
      </Card>
    </div>
  );
}
