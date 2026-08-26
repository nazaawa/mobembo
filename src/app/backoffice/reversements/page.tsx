import { currentSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { currentSettlementPeriod } from "@/lib/domain/settlements";
import { formatDateTime } from "@/lib/core/time";
import { Card, Badge, Empty, Money, Stat, Table, Why } from "@/components/ui";
import { CalculReversement } from "./calcul";

export const dynamic = "force-dynamic";

interface Reversement {
  id: string;
  period_start: string;
  period_end: string;
  gross_sales: number;
  commission: number;
  refunds_charged: number;
  penalties: number;
  subscription_due: number;
  guarantee_hold: number;
  net_payable: number;
  currency: string;
  status: string;
  paid_at: string | null;
}

/**
 * §2.10 Reversement — « Le détail ligne à ligne est consultable par la
 * compagnie dans son back-office. La transparence évite les litiges. »
 */
export default async function Reversements() {
  const session = await currentSession();
  if (!session || !["ADMIN_COMPAGNIE", "SUPER_ADMIN"].includes(session.activeRole)) redirect("/backoffice");
  const db = getDb();
  const companyId = session!.companyId!;
  const periode = currentSettlementPeriod();

  const reversements = await db
    .prepare<Reversement>(`SELECT * FROM settlements WHERE company_id = ? ORDER BY period_end DESC LIMIT 26`)
    .all(companyId);

  const abonnement = (await db
    .prepare(`SELECT * FROM subscriptions WHERE company_id = ? ORDER BY period_end DESC LIMIT 1`)
    .get(companyId)) as
    | {
        plan: string;
        buses_count: number;
        monthly_amount: number;
        currency: string;
        status: string;
        period_end: string;
      }
    | undefined;

  // MariaDB refuse `IN (sous-requête ... LIMIT ...)` : `reversements` est déjà
  // trié pareil (period_end DESC), donc son premier élément est le dernier
  // reversement — inutile de le redemander via une sous-requête imbriquée.
  const dernierReversementId = reversements[0]?.id ?? null;
  const lignes = dernierReversementId
    ? ((await db
        .prepare(`SELECT * FROM settlement_lines WHERE settlement_id = ?`)
        .all(dernierReversementId)) as Array<{ id: string; type: string; label: string; amount: number; currency: string }>)
    : [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Reversements</h1>
        <p className="text-sm text-texte-doux">
          Cycle hebdomadaire à J+7. Période en cours : {formatDateTime(periode.periodStart)} →{" "}
          {formatDateTime(periode.periodEnd)}, payable le {formatDateTime(periode.payableOn)}.
        </p>
      </div>

      {abonnement && (
        <div className="grid gap-3 sm:grid-cols-4">
          <Stat label="Palier" value={abonnement.plan} hint={`${abonnement.buses_count} bus`} />
          <Stat
            label="Abonnement mensuel"
            value={<Money amount={abonnement.monthly_amount} currency={abonnement.currency} />}
          />
          <Stat
            label="Statut"
            value={abonnement.status === "PILOTE_GRATUIT" ? "Pilote gratuit" : abonnement.status}
            tone={abonnement.status === "PILOTE_GRATUIT" ? "accent" : "neutre"}
          />
          <Stat label="Fin de période" value={formatDateTime(abonnement.period_end)} />
        </div>
      )}

      <Card
        title="Calculer un reversement"
        subtitle="Ventes en ligne − commission − remboursements imputés − pénalités − abonnement − réserve."
      >
        <CalculReversement periode={periode} />
      </Card>

      {lignes.length > 0 && (
        <Card title="Détail du dernier reversement calculé">
          <Table headers={["Poste", "Libellé", "Montant"]}>
            {lignes.map((ligne) => (
              <tr key={ligne.id}>
                <td className="px-2 py-1.5">
                  <Badge tone={ligne.amount < 0 ? "alerte" : "succes"}>{ligne.type}</Badge>
                </td>
                <td className="px-2 py-1.5 text-texte-doux">{ligne.label}</td>
                <td className="px-2 py-1.5 text-right">
                  <span className={ligne.amount < 0 ? "text-alerte" : ""}>
                    <Money amount={ligne.amount} currency={ligne.currency} />
                  </span>
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      <Card title="Historique">
        {reversements.length === 0 ? (
          <Empty>Aucun reversement calculé pour l&apos;instant.</Empty>
        ) : (
          <Table
            headers={[
              "Période",
              "Ventes en ligne",
              "Commission",
              "Remb.",
              "Pénalités",
              "Abonnement",
              "Réserve",
              "Net",
              "Statut",
            ]}
          >
            {reversements.map((reversement) => (
              <tr key={reversement.id}>
                <td className="whitespace-nowrap px-2 py-1.5 text-xs text-texte-doux">
                  {new Date(reversement.period_start).toLocaleDateString("fr-CD")} →{" "}
                  {new Date(reversement.period_end).toLocaleDateString("fr-CD")}
                </td>
                <td className="px-2 py-1.5 text-right">
                  <Money amount={reversement.gross_sales} currency={reversement.currency} />
                </td>
                <td className="px-2 py-1.5 text-right text-alerte">
                  −<Money amount={reversement.commission} currency={reversement.currency} />
                </td>
                <td className="px-2 py-1.5 text-right text-alerte">
                  −<Money amount={reversement.refunds_charged} currency={reversement.currency} />
                </td>
                <td className="px-2 py-1.5 text-right text-alerte">
                  −<Money amount={reversement.penalties} currency={reversement.currency} />
                </td>
                <td className="px-2 py-1.5 text-right text-alerte">
                  −<Money amount={reversement.subscription_due} currency={reversement.currency} />
                </td>
                <td className="px-2 py-1.5 text-right text-texte-doux">
                  −<Money amount={reversement.guarantee_hold} currency={reversement.currency} />
                </td>
                <td className="px-2 py-1.5 text-right font-semibold">
                  <Money amount={reversement.net_payable} currency={reversement.currency} />
                </td>
                <td className="px-2 py-1.5">
                  <Badge tone={reversement.status === "PAYE" ? "succes" : "attention"}>
                    {reversement.status === "PAYE" ? "payé" : "à payer"}
                  </Badge>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Why>
        Aucun reversement n&apos;est instantané : le décalage à J+7 crée la trésorerie sur laquelle
        s&apos;opère la compensation des remboursements et pénalités. Une réserve de garantie
        roulante est retenue sur le volume en ligne et restituée à la sortie du contrat.
      </Why>
    </div>
  );
}
