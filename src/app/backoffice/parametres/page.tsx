import { currentSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { companyPolicy, getCompany } from "@/lib/domain/repo";
import { LIABILITY_GRID } from "@/lib/domain/cancellation";
import { formatDateTime } from "@/lib/core/time";
import { DEFAULT_POLICY } from "@/lib/domain/types";
import { Card, Badge, Table, Why } from "@/components/ui";
import { FormulairePolitique } from "./formulaire";

export const dynamic = "force-dynamic";

/**
 * §2.9 : « Grille paramétrable. Chaque seuil — délais, pourcentages, durée de
 * validité des avoirs — est configurable par compagnie, avec la grille
 * pré-remplie. »
 */
export default async function Parametres() {
  const session = await currentSession();
  if (!session || !["ADMIN_COMPAGNIE", "SUPER_ADMIN"].includes(session.activeRole)) redirect("/backoffice");
  const company = await getCompany(session!.companyId!);
  const politique = companyPolicy(company);

  const indetermines = (await getDb()
    .prepare(
      `SELECT p.id, p.provider, p.amount, p.currency, p.payer_phone, p.created_at,
              b.buyer_name
         FROM payments p JOIN bookings b ON b.id = p.booking_id
        WHERE p.status = 'INDETERMINE'
          AND b.trip_id IN (SELECT id FROM trips WHERE company_id = ?)
        ORDER BY p.created_at`,
    )
    .all(session!.companyId)) as Array<{
    id: string;
    provider: string;
    amount: number;
    currency: string;
    payer_phone: string;
    created_at: string;
    buyer_name: string | null;
  }>;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Paramètres — {company.name}</h1>
        <p className="text-sm text-texte-doux">
          Commission {(company.commission_rate * 100).toFixed(1)} % · taux{" "}
          {company.currency_rate_usd_cdf} CDF/USD
          {company.currency_rate_at && ` (daté du ${formatDateTime(company.currency_rate_at)})`}
        </p>
      </div>

      <Card
        title="Grille de renoncement"
        subtitle="Les avoirs et remboursements sortent de la poche de la compagnie."
      >
        <FormulairePolitique
          politique={politique}
          parDefaut={DEFAULT_POLICY}
          commission={company.commission_rate}
          tauxUsdCdf={company.currency_rate_usd_cdf}
        />
        <div className="mt-4">
          <Why>
            La grille est un gradient d&apos;incitation, pas un barème de sanctions : chaque option
            doit rester plus intéressante que la suivante, dans l&apos;ordre qui arrange
            l&apos;exploitation — transférer, revendre, reporter, annuler tard, ne pas venir. Serrer
            un seuil pousse les passagers vers l&apos;option d&apos;après, qui coûte plus cher.
          </Why>
        </div>
      </Card>

      <Card
        title="Grille de responsabilité"
        subtitle="Annexe du contrat partenaire — qui rembourse quoi, et à qui c'est imputé."
      >
        <Table headers={["Situation", "Remboursement passager", "Avoir", "Imputé à"]}>
          {LIABILITY_GRID.map((regle) => (
            <tr
              key={regle.situation}
              className={regle.impute === "COMPAGNIE_PENALITE" ? "font-medium" : ""}
            >
              <td className="px-2 py-1.5">{regle.label}</td>
              <td className="px-2 py-1.5 tabular-nums">
                {Math.round(regle.remboursementRate * 100)} %
              </td>
              <td className="px-2 py-1.5 tabular-nums">
                {regle.avoirRate > 0 ? `${Math.round(regle.avoirRate * 100)} %` : "—"}
              </td>
              <td className="px-2 py-1.5">
                <Badge tone={regle.impute === "COMPAGNIE_PENALITE" ? "alerte" : "neutre"}>
                  {regle.impute === "COMPAGNIE_PENALITE"
                    ? "compagnie + pénalité"
                    : regle.impute.toLowerCase()}
                </Badge>
              </td>
            </tr>
          ))}
        </Table>
        <div className="mt-3">
          <Why>
            La ligne « siège non honoré » est la plus importante du contrat : c&apos;est la seule
            qui donne force contraignante au principe selon lequel aucun siège ne se vend hors
            système. Une pénalité au double du prix du billet rend la fraude au guichet
            économiquement absurde.
          </Why>
        </div>
      </Card>

      {indetermines.length > 0 && (
        <Card
          title="Paiements en attente d'arbitrage"
          subtitle="Statut indéterminé après 5 minutes : un humain tranche, le système ne devine jamais."
        >
          <Table headers={["Depuis", "Opérateur", "Payeur", "Montant", ""]}>
            {indetermines.map((paiement) => (
              <tr key={paiement.id}>
                <td className="whitespace-nowrap px-2 py-1.5 text-xs text-texte-doux">
                  {formatDateTime(paiement.created_at)}
                </td>
                <td className="px-2 py-1.5">{paiement.provider}</td>
                <td className="px-2 py-1.5">
                  {paiement.buyer_name}
                  <div className="text-[10px] text-texte-doux">{paiement.payer_phone}</div>
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {(paiement.amount / 100).toFixed(2)} {paiement.currency}
                </td>
                <td className="px-2 py-1.5 text-right">
                  <a
                    href={`/api/paiements/${paiement.id}/statut`}
                    className="text-xs text-accent hover:underline"
                  >
                    Réinterroger l&apos;opérateur
                  </a>
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
    </div>
  );
}
