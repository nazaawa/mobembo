import Link from "next/link";
import { currentSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { formatDateTime } from "@/lib/core/time";
import { currentSettlementPeriod } from "@/lib/domain/settlements";
import { Card, Stat, Badge, Empty, Money, Why, Table } from "@/components/ui";
import { AcquitterAlerte } from "./alertes";

export const dynamic = "force-dynamic";

/**
 * Tableau de bord — §4.1 : « Le dirigeant voit pour la première fois ses
 * recettes réelles en temps réel. C'est le produit qui se vend le plus
 * facilement, parce qu'il résout un problème d'argent. »
 */
export default async function TableauDeBord() {
  const session = await currentSession();
  const db = getDb();
  const companyId = session!.companyId;

  const jour = new Date();
  jour.setUTCHours(0, 0, 0, 0);
  const debutJour = jour.toISOString();

  const recettes = db
    .prepare(
      `SELECT t.price_currency AS devise, COUNT(*) AS billets,
              COALESCE(SUM(t.price_amount), 0) AS montant,
              SUM(CASE WHEN b.channel = 'GUICHET' THEN t.price_amount ELSE 0 END) AS guichet,
              SUM(CASE WHEN b.channel = 'EN_LIGNE' THEN t.price_amount ELSE 0 END) AS enLigne
         FROM tickets t JOIN bookings b ON b.id = t.booking_id
        WHERE t.trip_id IN (SELECT id FROM trips WHERE company_id = ?)
          AND b.status = 'CONFIRME' AND t.created_at >= ?
        GROUP BY t.price_currency`,
    )
    .all(companyId, debutJour) as Array<{
    devise: string;
    billets: number;
    montant: number;
    guichet: number;
    enLigne: number;
  }>;

  const caisses = db
    .prepare(
      `SELECT cs.id, u.name AS agent, a.name AS agence, cs.opened_at, cs.closed_at,
              cs.variance, cs.currency, cs.opening_float
         FROM cash_sessions cs
         JOIN users u ON u.id = cs.user_id
         JOIN agencies a ON a.id = cs.agency_id
        WHERE a.company_id = ? AND cs.opened_at >= ?
        ORDER BY cs.opened_at DESC`,
    )
    .all(companyId, debutJour) as Array<{
    id: string;
    agent: string;
    agence: string;
    opened_at: string;
    closed_at: string | null;
    variance: number | null;
    currency: string;
    opening_float: number;
  }>;

  const alertes = db
    .prepare(
      `SELECT * FROM alerts WHERE (company_id = ? OR company_id IS NULL)
        AND acknowledged_at IS NULL ORDER BY created_at DESC LIMIT 10`,
    )
    .all(companyId) as Array<{
    id: string;
    kind: string;
    severity: string;
    body: string;
    created_at: string;
  }>;

  const prochainsDeparts = db
    .prepare(
      `SELECT t.id, t.departure_datetime, r.origin_city, r.destination_city, b.plate_number,
              (SELECT COUNT(*) FROM trip_seats s WHERE s.trip_id = t.id) AS sieges,
              (SELECT COUNT(*) FROM trip_seats s WHERE s.trip_id = t.id
                AND s.status IN ('VENDU','EMBARQUE')) AS vendus
         FROM trips t JOIN routes r ON r.id = t.route_id JOIN buses b ON b.id = t.bus_id
        WHERE t.company_id = ? AND t.status IN ('PLANIFIE','EN_VENTE')
          AND t.departure_datetime >= datetime('now')
        ORDER BY t.departure_datetime LIMIT 8`,
    )
    .all(companyId) as Array<{
    id: string;
    departure_datetime: string;
    origin_city: string;
    destination_city: string;
    plate_number: string;
    sieges: number;
    vendus: number;
  }>;

  const periode = currentSettlementPeriod();
  const principal = recettes.find((r) => r.devise === "USD") ?? recettes[0];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Recettes du jour</h1>
          <p className="text-sm text-texte-doux">
            Depuis {formatDateTime(debutJour)} — mise à jour à chaque vente.
          </p>
        </div>
        <span className="text-xs text-texte-doux">
          Prochain reversement : {formatDateTime(periode.payableOn)}
        </span>
      </div>

      {recettes.length === 0 ? (
        <Empty>Aucune vente enregistrée aujourd&apos;hui.</Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {principal && (
            <>
              <Stat
                label="Recette totale"
                value={<Money amount={principal.montant} currency={principal.devise} />}
                hint={`${principal.billets} billet(s)`}
                tone="succes"
              />
              <Stat
                label="Au guichet"
                value={<Money amount={principal.guichet} currency={principal.devise} />}
              />
              <Stat
                label="En ligne"
                value={<Money amount={principal.enLigne} currency={principal.devise} />}
              />
            </>
          )}
          <Stat
            label="Caisses ouvertes"
            value={caisses.filter((c) => !c.closed_at).length}
            hint={`${caisses.length} session(s) aujourd'hui`}
          />
        </div>
      )}

      {alertes.length > 0 && (
        <Card
          title="Alertes"
          subtitle="Trou de séquence, écart de caisse, annulations anormales, paiement indéterminé."
        >
          <ul className="space-y-2">
            {alertes.map((alerte) => (
              <li
                key={alerte.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-alerte/30 bg-alerte-doux px-3 py-2.5"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <Badge tone="alerte">{alerte.kind.replace(/_/g, " ")}</Badge>
                    <span className="text-[11px] text-texte-doux">
                      {formatDateTime(alerte.created_at)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm">{alerte.body}</p>
                </div>
                <AcquitterAlerte alerteId={alerte.id} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Sessions de caisse du jour">
          {caisses.length === 0 ? (
            <Empty>Aucune caisse ouverte aujourd&apos;hui.</Empty>
          ) : (
            <Table headers={["Agent", "Agence", "Ouverte", "État", "Écart"]}>
              {caisses.map((caisse) => (
                <tr key={caisse.id}>
                  <td className="px-2 py-1.5 font-medium">{caisse.agent}</td>
                  <td className="px-2 py-1.5 text-texte-doux">{caisse.agence}</td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-texte-doux">
                    {formatDateTime(caisse.opened_at)}
                  </td>
                  <td className="px-2 py-1.5">
                    <Badge tone={caisse.closed_at ? "neutre" : "succes"}>
                      {caisse.closed_at ? "fermée" : "ouverte"}
                    </Badge>
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    {caisse.variance === null ? (
                      <span className="text-texte-doux">—</span>
                    ) : (
                      <span className={caisse.variance === 0 ? "text-succes" : "text-alerte"}>
                        <Money amount={caisse.variance} currency={caisse.currency} />
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        <Card title="Prochains départs">
          {prochainsDeparts.length === 0 ? (
            <Empty>Aucun départ programmé.</Empty>
          ) : (
            <Table headers={["Départ", "Ligne", "Bus", "Remplissage"]}>
              {prochainsDeparts.map((trajet) => {
                const taux = trajet.sieges > 0 ? trajet.vendus / trajet.sieges : 0;
                return (
                  <tr key={trajet.id}>
                    <td className="whitespace-nowrap px-2 py-1.5 text-texte-doux">
                      {formatDateTime(trajet.departure_datetime)}
                    </td>
                    <td className="px-2 py-1.5">
                      <Link
                        href={`/backoffice/trajet/${trajet.id}`}
                        className="font-medium hover:text-accent"
                      >
                        {trajet.origin_city} → {trajet.destination_city}
                      </Link>
                    </td>
                    <td className="px-2 py-1.5 text-xs text-texte-doux">{trajet.plate_number}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {trajet.vendus}/{trajet.sieges}
                      <span
                        className={`ml-1.5 text-xs ${taux >= 0.8 ? "text-succes" : "text-texte-doux"}`}
                      >
                        {Math.round(taux * 100)} %
                      </span>
                    </td>
                  </tr>
                );
              })}
            </Table>
          )}
        </Card>
      </div>

      <Why>
        Toute vente passe par ce système ou n&apos;existe pas. Un siège vendu au guichet sans y
        figurer n&apos;est pas une recette non déclarée : c&apos;est un siège que la plateforme
        peut vendre en ligne au même moment, et un passager refusé à l&apos;embarquement — imputé à
        la compagnie, avec pénalité.
      </Why>
    </div>
  );
}
