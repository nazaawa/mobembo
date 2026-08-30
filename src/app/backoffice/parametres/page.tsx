import { currentSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { companyPolicy, getCompany } from "@/lib/domain/repo";
import { LIABILITY_GRID } from "@/lib/domain/cancellation";
import { formatDateTime } from "@/lib/core/time";
import { DEFAULT_POLICY } from "@/lib/domain/types";
import { companyAccess, hasModule } from "@/lib/domain/access";
import { Card, Badge, Table, Why } from "@/components/ui";
import { FormulairePolitique } from "./formulaire";
import { PanneauModules } from "./modules";

export const dynamic = "force-dynamic";

/**
 * Paramètres du directeur.
 *
 * En tête, les phases : ce que Mobembo a ouvert pour l'agence, et
 * l'interrupteur qui décide de l'afficher ou non (§29). Le reste — grilles de
 * renoncement et de responsabilité (§2.9), arbitrages de paiement — n'a de sens
 * que si l'agence vend en ligne, et ne s'affiche donc que dans ce cas.
 */
export default async function Parametres() {
  const session = await currentSession();
  if (!session || !["ADMIN_COMPAGNIE", "SUPER_ADMIN"].includes(session.activeRole)) redirect("/backoffice");
  const company = await getCompany(session!.companyId!);
  const politique = companyPolicy(company);
  const acces = await companyAccess(session!.companyId!);
  const vendEnLigne = hasModule(acces, "ERP");
  // Jamais de numéro inventé : l'assistance n'apparaît que si elle est
  // configurée pour ce déploiement.
  const assistance = process.env.MOBEMBO_SUPPORT_PHONE ?? null;

  const indetermines = !vendEnLigne ? [] : (await getDb()
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
          {vendEnLigne ? (
            <>
              Commission {(company.commission_rate * 100).toFixed(1)} % · taux{" "}
              {company.currency_rate_usd_cdf} CDF/USD
              {company.currency_rate_at && ` (daté du ${formatDateTime(company.currency_rate_at)})`}
            </>
          ) : (
            "Ce que votre agence utilise de Mobembo, et ce qu'elle affiche."
          )}
        </p>
      </div>

      <Card
        title="Phases et affichage"
        subtitle="Mobembo ouvre les phases ; vous choisissez celles que votre équipe voit."
      >
        <PanneauModules
          modules={acces.modules}
          vueComplete={acces.advancedView}
          telephoneMobembo={assistance}
        />
      </Card>

      {vendEnLigne && (
      <>
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
      </>
      )}

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
