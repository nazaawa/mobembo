import { currentSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { revenueReport } from "@/lib/domain/settlements";
import { formatDateTime } from "@/lib/core/time";
import { CHANNEL_LABELS, PROVIDER_LABELS, type Channel, type PaymentProviderId } from "@/lib/domain/types";
import { Card, Stat, Badge, Empty, Money, Table, Why } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * L'heure courante est lue hors du corps du composant : un rendu doit rester
 * pur, et deux appels à `Date.now()` dans le même rendu peuvent différer.
 */
async function fenetre(jours: number): Promise<{ from: string; to: string }> {
  const maintenant = Date.now();
  return {
    from: new Date(maintenant - jours * 86_400_000).toISOString(),
    to: new Date(maintenant + 86_400_000).toISOString(),
  };
}

/** §2.11 Rapports du back-office + §5.1 indicateurs de réussite. */
export default async function Rapports(props: PageProps<"/backoffice/rapports">) {
  const params = await props.searchParams;
  const session = await currentSession();
  const companyId = session!.companyId!;
  const db = getDb();

  const jours = Number(typeof params.jours === "string" ? params.jours : 30);
  const { from, to } = await fenetre(jours);

  const recettes = revenueReport({ companyId, from, to, db });

  const ecarts = db
    .prepare(
      `SELECT u.name AS agent, COUNT(*) AS sessions,
              COALESCE(SUM(cs.variance), 0) AS cumul,
              COALESCE(SUM(ABS(cs.variance)), 0) AS absolu, cs.currency
         FROM cash_sessions cs
         JOIN users u ON u.id = cs.user_id
         JOIN agencies a ON a.id = cs.agency_id
        WHERE a.company_id = ? AND cs.closed_at IS NOT NULL AND cs.closed_at >= ?
        GROUP BY u.name, cs.currency ORDER BY absolu DESC`,
    )
    .all(companyId, from) as Array<{
    agent: string;
    sessions: number;
    cumul: number;
    absolu: number;
    currency: string;
  }>;

  const axes = db
    .prepare(
      `SELECT r.origin_city || ' → ' || r.destination_city AS axe,
              COUNT(DISTINCT t.id) AS departs,
              SUM((SELECT COUNT(*) FROM trip_seats s WHERE s.trip_id = t.id)) AS sieges,
              SUM((SELECT COUNT(*) FROM tickets k WHERE k.trip_id = t.id AND k.status = 'EMBARQUE')) AS embarques,
              SUM((SELECT COUNT(*) FROM tickets k WHERE k.trip_id = t.id AND k.status = 'EXPIRE')) AS noShows,
              SUM((SELECT COUNT(*) FROM tickets k WHERE k.trip_id = t.id
                    AND k.status IN ('EMIS','EN_REVENTE','EMBARQUE','EXPIRE'))) AS vendus
         FROM trips t JOIN routes r ON r.id = t.route_id
        WHERE t.company_id = ? AND t.departure_datetime >= ? AND t.status IN ('PARTI','CLOTURE')
        GROUP BY axe ORDER BY departs DESC`,
    )
    .all(companyId, from) as Array<{
    axe: string;
    departs: number;
    sieges: number;
    embarques: number;
    noShows: number;
    vendus: number;
  }>;

  const revente = db
    .prepare(
      `SELECT COUNT(*) AS annonces,
              SUM(CASE WHEN status = 'VENDUE' THEN 1 ELSE 0 END) AS vendues,
              COALESCE(SUM(fee_amount), 0) AS commissions,
              AVG(CASE WHEN sold_at IS NOT NULL
                  THEN (julianday(sold_at) - julianday(listed_at)) * 24 END) AS delaiMoyenH
         FROM resale_listings
        WHERE trip_id IN (SELECT id FROM trips WHERE company_id = ?) AND listed_at >= ?`,
    )
    .get(companyId, from) as {
    annonces: number;
    vendues: number;
    commissions: number;
    delaiMoyenH: number | null;
  };

  const indicateurs = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM alerts WHERE company_id = ? AND kind = 'TROU_SEQUENCE') AS trous,
         (SELECT COUNT(*) FROM payments p JOIN bookings b ON b.id = p.booking_id
           WHERE b.trip_id IN (SELECT id FROM trips WHERE company_id = ?)
             AND p.provider <> 'ESPECES') AS initiations,
         (SELECT COUNT(*) FROM payments p JOIN bookings b ON b.id = p.booking_id
           WHERE b.trip_id IN (SELECT id FROM trips WHERE company_id = ?)
             AND p.status = 'INDETERMINE') AS indetermines,
         (SELECT COUNT(*) FROM refunds r JOIN tickets t ON t.id = r.ticket_id
           WHERE t.trip_id IN (SELECT id FROM trips WHERE company_id = ?)
             AND r.status = 'EN_FILE' AND r.created_at <= datetime('now','-48 hours')) AS remboursementsEnRetard,
         (SELECT COUNT(*) FROM sync_log WHERE kind = 'VENTE_POS' AND result = 'APPLIQUE') AS syncOk,
         (SELECT COUNT(*) FROM sync_log WHERE kind = 'VENTE_POS' AND result <> 'APPLIQUE') AS syncKo`,
    )
    .get(companyId, companyId, companyId, companyId) as {
    trous: number;
    initiations: number;
    indetermines: number;
    remboursementsEnRetard: number;
    syncOk: number;
    syncKo: number;
  };

  const tauxIndetermine =
    indicateurs.initiations > 0 ? indicateurs.indetermines / indicateurs.initiations : 0;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Rapports</h1>
        <p className="text-sm text-texte-doux">
          Période : {formatDateTime(from)} → aujourd&apos;hui ({jours} jours)
        </p>
      </div>

      <Card
        title="Indicateurs de réussite"
        subtitle="Les chiffres qui décident du passage de jalon."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Stat
            label="Trous de séquence"
            value={indicateurs.trous}
            hint="cible : 0"
            tone={indicateurs.trous === 0 ? "succes" : "alerte"}
          />
          <Stat
            label="Paiements indéterminés"
            value={`${(tauxIndetermine * 100).toFixed(1)} %`}
            hint="cible : < 1 %"
            tone={tauxIndetermine < 0.01 ? "succes" : "alerte"}
          />
          <Stat
            label="Remboursements > 48 h"
            value={indicateurs.remboursementsEnRetard}
            hint="SLA : 48 h"
            tone={indicateurs.remboursementsEnRetard === 0 ? "succes" : "alerte"}
          />
          <Stat
            label="Ventes hors-ligne synchronisées"
            value={indicateurs.syncOk}
            hint={
              indicateurs.syncKo > 0 ? `${indicateurs.syncKo} en conflit` : "aucun conflit"
            }
            tone={indicateurs.syncKo === 0 ? "succes" : "alerte"}
          />
          <Stat
            label="Reventes finalisées"
            value={`${revente.vendues ?? 0} / ${revente.annonces ?? 0}`}
            hint={
              revente.delaiMoyenH
                ? `délai moyen ${revente.delaiMoyenH.toFixed(1)} h`
                : "aucune revente"
            }
          />
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Recettes par agence">
          {recettes.parAgence.length === 0 ? (
            <Empty>Aucune recette sur la période.</Empty>
          ) : (
            <Table headers={["Agence", "Billets", "Montant"]}>
              {recettes.parAgence.map((ligne, index) => (
                <tr key={index}>
                  <td className="px-2 py-1.5 font-medium">{ligne.agence}</td>
                  <td className="px-2 py-1.5 tabular-nums text-texte-doux">{ligne.billets}</td>
                  <td className="px-2 py-1.5 text-right">
                    <Money amount={ligne.montant} currency={ligne.currency} />
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        <Card title="Recettes par guichetier">
          {recettes.parGuichetier.length === 0 ? (
            <Empty>Aucune vente guichet sur la période.</Empty>
          ) : (
            <Table headers={["Agent", "Billets", "Montant"]}>
              {recettes.parGuichetier.map((ligne, index) => (
                <tr key={index}>
                  <td className="px-2 py-1.5 font-medium">{ligne.agent}</td>
                  <td className="px-2 py-1.5 tabular-nums text-texte-doux">{ligne.billets}</td>
                  <td className="px-2 py-1.5 text-right">
                    <Money amount={ligne.montant} currency={ligne.currency} />
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        <Card title="Répartition par canal">
          {recettes.parCanal.length === 0 ? (
            <Empty>Aucune vente sur la période.</Empty>
          ) : (
            <Table headers={["Canal", "Billets", "Montant"]}>
              {recettes.parCanal.map((ligne, index) => (
                <tr key={index}>
                  <td className="px-2 py-1.5 font-medium">
                    {CHANNEL_LABELS[ligne.canal as Channel] ?? ligne.canal}
                  </td>
                  <td className="px-2 py-1.5 tabular-nums text-texte-doux">{ligne.billets}</td>
                  <td className="px-2 py-1.5 text-right">
                    <Money amount={ligne.montant} currency={ligne.currency} />
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        <Card title="Par opérateur Mobile Money">
          {recettes.parOperateur.length === 0 ? (
            <Empty>Aucun paiement confirmé sur la période.</Empty>
          ) : (
            <Table headers={["Opérateur", "Transactions", "Montant"]}>
              {recettes.parOperateur.map((ligne, index) => (
                <tr key={index}>
                  <td className="px-2 py-1.5 font-medium">
                    {PROVIDER_LABELS[ligne.operateur as PaymentProviderId] ?? ligne.operateur}
                  </td>
                  <td className="px-2 py-1.5 tabular-nums text-texte-doux">{ligne.transactions}</td>
                  <td className="px-2 py-1.5 text-right">
                    <Money amount={ligne.montant} currency={ligne.currency} />
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>

      <Card
        title="Écarts de caisse par agent"
        subtitle="Classement par écart cumulé en valeur absolue."
      >
        {ecarts.length === 0 ? (
          <Empty>Aucune session de caisse fermée sur la période.</Empty>
        ) : (
          <Table headers={["Agent", "Sessions", "Écart cumulé", "Écart absolu"]}>
            {ecarts.map((ligne, index) => (
              <tr key={index}>
                <td className="px-2 py-1.5 font-medium">{ligne.agent}</td>
                <td className="px-2 py-1.5 tabular-nums text-texte-doux">{ligne.sessions}</td>
                <td className="px-2 py-1.5 text-right">
                  <span className={ligne.cumul === 0 ? "text-succes" : "text-alerte"}>
                    <Money amount={ligne.cumul} currency={ligne.currency} />
                  </span>
                </td>
                <td className="px-2 py-1.5 text-right text-texte-doux">
                  <Money amount={ligne.absolu} currency={ligne.currency} />
                </td>
              </tr>
            ))}
          </Table>
        )}
        <div className="mt-3">
          <Why>
            Un écart cumulé proche de zéro avec un écart absolu élevé signale des erreurs de
            rendu de monnaie qui se compensent. Un écart cumulé systématiquement négatif chez un
            seul agent est une autre conversation.
          </Why>
        </div>
      </Card>

      <Card title="Remplissage et no-show par axe">
        {axes.length === 0 ? (
          <Empty>
            Aucun départ clôturé sur la période. Le taux de remplissage réel se mesure au scan
            d&apos;embarquement, pas aux billets vendus.
          </Empty>
        ) : (
          <Table headers={["Axe", "Départs", "Vendus", "Embarqués", "Remplissage", "No-show"]}>
            {axes.map((axe) => {
              const remplissage = axe.sieges > 0 ? axe.embarques / axe.sieges : 0;
              const noShow = axe.vendus > 0 ? axe.noShows / axe.vendus : 0;
              return (
                <tr key={axe.axe}>
                  <td className="px-2 py-1.5 font-medium">{axe.axe}</td>
                  <td className="px-2 py-1.5 tabular-nums text-texte-doux">{axe.departs}</td>
                  <td className="px-2 py-1.5 tabular-nums text-texte-doux">{axe.vendus}</td>
                  <td className="px-2 py-1.5 tabular-nums text-texte-doux">{axe.embarques}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {Math.round(remplissage * 100)} %
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <Badge tone={noShow > 0.1 ? "alerte" : "neutre"}>
                      {Math.round(noShow * 100)} %
                    </Badge>
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
    </div>
  );
}
