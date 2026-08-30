import Link from "next/link";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { currentSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { formatDateTime, formatDay, formatTime } from "@/lib/core/time";
import { currentSettlementPeriod } from "@/lib/domain/settlements";
import { companyProfile } from "@/lib/domain/directory";
import { companyAccess, hasModule } from "@/lib/domain/access";
import {
  companyReservations,
  reservationSummary,
  settleFinishedReservations,
} from "@/lib/domain/reservations";
import { Card, Badge, Empty, Money, Why, Table } from "@/components/ui";
import { AcquitterAlerte } from "./alertes";

export const dynamic = "force-dynamic";

/**
 * Tableau de bord — deux étages, dans l'ordre où une agence les atteint.
 *
 * En haut, sa présence sur Mobembo : trajets publiés, réservations reçues.
 * C'est vrai dès le premier jour, sans bus enregistré ni caisse ouverte. En
 * dessous, la billetterie complète (§4.1 : « le dirigeant voit ses recettes
 * réelles en temps réel »), affichée seulement quand l'agence l'utilise
 * réellement — un mur de zéros n'apprend rien à qui n'a pas encore franchi
 * cette étape, et donne l'impression d'un outil qui exige tout d'un coup.
 */
export default async function TableauDeBord() {
  const session = await currentSession();
  // Le layout et la page rendent en parallèle : le `redirect()` du layout
  // n'empêche pas cette fonction de s'exécuter. Sans cette garde, une session
  // expirée produit une exception au lieu d'une redirection propre.
  if (!session?.companyId) redirect("/guichet/connexion");
  const db = getDb();
  const companyId = session!.companyId;
  const agencyId = session!.activeRole === "GERANT_AGENCE" ? session!.agencyId : null;
  if (session!.activeRole === "GERANT_AGENCE" && !agencyId) {
    return <Empty>Aucune agence n&apos;est rattachée à ce rôle. Contactez la direction.</Empty>;
  }

  await settleFinishedReservations();

  const jour = new Date();
  jour.setUTCHours(0, 0, 0, 0);
  const debutJour = jour.toISOString();

  const recettes = (await db
    .prepare(
      `SELECT t.price_currency AS devise, COUNT(*) AS billets,
              COALESCE(SUM(t.price_amount), 0) AS montant,
              SUM(CASE WHEN b.channel = 'GUICHET' THEN t.price_amount ELSE 0 END) AS guichet,
              SUM(CASE WHEN b.channel = 'EN_LIGNE' THEN t.price_amount ELSE 0 END) AS enLigne
         FROM tickets t JOIN bookings b ON b.id = t.booking_id
        WHERE t.trip_id IN (SELECT id FROM trips WHERE company_id = ? AND (? IS NULL OR origin_agency_id = ?))
          AND b.status = 'CONFIRME' AND t.created_at >= ?
        GROUP BY t.price_currency`,
    )
    .all(companyId, agencyId, agencyId, debutJour)) as Array<{
    devise: string;
    billets: number;
    montant: number;
    guichet: number;
    enLigne: number;
  }>;

  const caisses = (await db
    .prepare(
      `SELECT cs.id, u.name AS agent, a.name AS agence, cs.opened_at, cs.closed_at,
              cs.variance, cs.currency, cs.opening_float
         FROM cash_sessions cs
         JOIN users u ON u.id = cs.user_id
         JOIN agencies a ON a.id = cs.agency_id
        WHERE a.company_id = ? AND (? IS NULL OR a.id = ?) AND cs.opened_at >= ?
        ORDER BY cs.opened_at DESC`,
    )
    .all(companyId, agencyId, agencyId, debutJour)) as Array<{
    id: string;
    agent: string;
    agence: string;
    opened_at: string;
    closed_at: string | null;
    variance: number | null;
    currency: string;
    opening_float: number;
  }>;

  const alertes = (await db
    .prepare(
      `SELECT * FROM alerts WHERE (company_id = ? OR company_id IS NULL)
        AND (? IS NULL OR agency_id IS NULL OR agency_id = ?)
        AND acknowledged_at IS NULL ORDER BY created_at DESC LIMIT 10`,
    )
    .all(companyId, agencyId, agencyId)) as Array<{
    id: string;
    kind: string;
    severity: string;
    body: string;
    created_at: string;
  }>;

  // MySQL n'a pas datetime('now') : les horodatages sont des chaînes ISO 8601,
  // "maintenant" est calculé côté JS et lié comme paramètre ordinaire.
  const maintenant = new Date().toISOString();
  const prochainsDeparts = (await db
    .prepare(
      `SELECT t.id, t.departure_datetime, r.origin_city, r.destination_city, b.plate_number,
              (SELECT COUNT(*) FROM trip_seats s WHERE s.trip_id = t.id) AS sieges,
              (SELECT COUNT(*) FROM trip_seats s WHERE s.trip_id = t.id
                AND s.status IN ('VENDU','EMBARQUE')) AS vendus
         FROM trips t JOIN routes r ON r.id = t.route_id JOIN buses b ON b.id = t.bus_id
        WHERE t.company_id = ? AND (? IS NULL OR t.origin_agency_id = ?)
          AND t.status IN ('PLANIFIE','EN_VENTE')
          AND t.departure_datetime >= ?
        ORDER BY t.departure_datetime LIMIT 8`,
    )
    .all(companyId, agencyId, agencyId, maintenant)) as Array<{
    id: string;
    departure_datetime: string;
    origin_city: string;
    destination_city: string;
    plate_number: string;
    sieges: number;
    vendus: number;
  }>;

  const presence = (await db
    .prepare<{ horaires: number; ouverts: number; bus: number; villes: number }>(
      `SELECT
         (SELECT COUNT(*) FROM schedules WHERE company_id = ? AND status = 'PUBLIE') AS horaires,
         (SELECT COUNT(*) FROM schedules
           WHERE company_id = ? AND status = 'PUBLIE' AND booking_enabled = 1) AS ouverts,
         (SELECT COUNT(*) FROM buses WHERE company_id = ? AND status = 'ACTIF') AS bus,
         (SELECT COUNT(*) FROM (
             SELECT origin_city AS v FROM schedules WHERE company_id = ? AND status = 'PUBLIE'
             UNION SELECT destination_city FROM schedules WHERE company_id = ? AND status = 'PUBLIE'
           ) villes) AS villes`,
    )
    .get(companyId, companyId, companyId, companyId, companyId)) as {
    horaires: number;
    ouverts: number;
    bus: number;
    villes: number;
  };

  const acces = await companyAccess(companyId!);
  const reservationOuverte = hasModule(acces, "RESERVATION");

  const [resume, reservations, fiche] = await Promise.all([
    reservationSummary(companyId!),
    companyReservations({ companyId: companyId!, scope: "A_VENIR" }),
    companyProfile(companyId!),
  ]);

  const periode = currentSettlementPeriod();
  const billetsTotal = recettes.reduce((total, recette) => total + recette.billets, 0);
  const caissesOuvertes = caisses.filter((caisse) => !caisse.closed_at).length;
  // L'agence « utilise la billetterie » dès qu'elle a une flotte enregistrée ou
  // un départ programmé : c'est le seuil où recettes et caisses deviennent des
  // chiffres, pas des cases vides.
  const utiliseBilletterie =
    hasModule(acces, "ERP") &&
    acces.advancedView &&
    (presence.bus > 0 || prochainsDeparts.length > 0 || billetsTotal > 0);
  const rienPublie = presence.horaires === 0 && !utiliseBilletterie;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-accent">Tableau de bord</p>
          <h1 className="mt-1 font-heading text-3xl font-bold tracking-tight text-navy">
            {fiche.name}
          </h1>
          <p className="mt-1 text-sm text-texte-doux">
            Votre présence sur Mobembo{utiliseBilletterie && ", et votre activité du jour"}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {utiliseBilletterie && (
            <span className="text-xs text-texte-doux">
              Reversement : {formatDateTime(periode.payableOn)}
            </span>
          )}
          <Link
            href="/backoffice/horaires"
            className="inline-flex min-h-11 items-center justify-center rounded-[10px] bg-accent px-4 text-sm font-bold text-white hover:bg-accent-profond"
          >
            Publier un trajet
          </Link>
        </div>
      </div>

      {rienPublie && (
        <section className="rounded-[14px] border border-accent/25 bg-accent-doux p-6">
          <h2 className="font-heading text-xl font-bold text-navy">
            Vous n’apparaissez pas encore dans la recherche
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-texte">
            Trois informations suffisent pour être trouvé par les voyageurs : vos deux villes, une
            heure et un prix. Ni bus enregistré, ni plan de sièges, ni paiement en ligne.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/backoffice/horaires"
              className="inline-flex min-h-11 items-center rounded-[10px] bg-accent px-4 text-sm font-bold text-white transition hover:bg-accent-profond"
            >
              Publier mon premier trajet
            </Link>
            <Link
              href="/backoffice/vitrine"
              className="inline-flex min-h-11 items-center rounded-[10px] border border-bordure bg-surface px-4 text-sm font-semibold text-navy transition hover:border-accent hover:text-accent"
            >
              Compléter mes coordonnées
            </Link>
          </div>
        </section>
      )}

      {!fiche.phone && !fiche.whatsapp && presence.horaires > 0 && (
        <p
          role="status"
          className="rounded-lg border border-attention/30 bg-attention-doux px-4 py-3 text-sm leading-6 text-attention"
        >
          <strong className="font-semibold">Aucun numéro publié.</strong> Un voyageur qui trouve vos
          trajets ne peut pas vous joindre.{" "}
          <Link href="/backoffice/vitrine" className="font-semibold underline">
            Ajouter un téléphone
          </Link>
        </p>
      )}

      <section aria-labelledby="presence-mobembo">
        <h2 id="presence-mobembo" className="sr-only">
          Présence sur Mobembo
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <DashboardKpi
            label="Trajets publiés"
            value={presence.horaires}
            hint={`${presence.ouverts} ouvert(s) à la réservation`}
            icon="calendar"
          />
          {reservationOuverte && (
            <>
              <DashboardKpi
                label="Réservations à venir"
                value={resume.aVenir}
                hint={`${resume.placesAVenir} place(s) retenue(s)`}
                icon="ticket"
              />
              <DashboardKpi
                label="Départs réservés aujourd’hui"
                value={resume.aujourdhui}
                hint="Passagers attendus au point d'embarquement"
                icon="ticket"
              />
            </>
          )}
          {!reservationOuverte && (
            <DashboardKpi
              label="Villes desservies"
              value={presence.villes}
              hint="au départ comme à l'arrivée"
              icon="calendar"
            />
          )}
          <DashboardKpi
            label="Alertes à traiter"
            value={alertes.length}
            hint={alertes.length ? "Une action est attendue" : "Aucune anomalie ouverte"}
            icon="alert"
            tone={alertes.length ? "alerte" : "succes"}
          />
        </div>
      </section>

      {reservationOuverte && presence.ouverts > 0 && (
        <Card
          title="Prochains passagers attendus"
          subtitle="Réservations prises en ligne. Le paiement se fait chez vous."
          actions={
            <Link
              href="/backoffice/reservations"
              className="text-sm font-semibold text-accent hover:underline"
            >
              Tout voir
            </Link>
          }
        >
          {reservations.length === 0 ? (
            <Empty>
              Aucune réservation pour l&apos;instant. Vos {presence.ouverts} départ(s) ouverts
              apparaissent dans la recherche des voyageurs.
            </Empty>
          ) : (
            <Table headers={["Départ", "Passager", "Places", "Référence"]}>
              {reservations.slice(0, 6).map((reservation) => (
                <tr key={reservation.id}>
                  <td className="px-2 py-1.5">
                    <span className="font-medium">
                      {reservation.origin_city} → {reservation.destination_city}
                    </span>
                    <span className="block text-[11px] text-texte-doux">
                      {formatDay(reservation.travel_date)} · {formatTime(reservation.departure_at)}
                    </span>
                  </td>
                  <td className="px-2 py-1.5">
                    {reservation.passenger_name}
                    <span className="block text-[11px] tabular-nums text-texte-doux">
                      {reservation.passenger_phone}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 tabular-nums">{reservation.seats}</td>
                  <td className="px-2 py-1.5 font-mono text-xs">{reservation.reference}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
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

      {utiliseBilletterie && (
        <section aria-labelledby="billetterie" className="space-y-4 border-t border-bordure pt-6">
          <div>
            <h2 id="billetterie" className="font-heading text-xl font-bold text-navy">
              Billetterie
            </h2>
            <p className="mt-1 text-sm text-texte-doux">
              Recettes, caisses et départs depuis {formatDateTime(debutJour)}.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <section className="rounded-[14px] bg-navy p-5 text-white shadow-[0_12px_30px_rgba(8,22,45,0.12)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-white/55">
                Recette du jour
              </p>
              <div className="mt-3 space-y-1">
                {recettes.length > 0 ? (
                  recettes.map((recette) => (
                    <p key={recette.devise} className="text-2xl font-bold tabular-nums">
                      <Money amount={recette.montant} currency={recette.devise} />
                    </p>
                  ))
                ) : (
                  <p className="text-2xl font-bold">—</p>
                )}
              </div>
              <p className="mt-3 text-xs text-white/55">Mise à jour après chaque vente confirmée</p>
            </section>
            <DashboardKpi
              label="Billets vendus"
              value={billetsTotal}
              hint="Guichet et vente en ligne"
              icon="ticket"
            />
            <DashboardKpi
              label="Caisses ouvertes"
              value={caissesOuvertes}
              hint={`${caisses.length} session(s) aujourd'hui`}
              icon="cash"
            />
          </div>

          {recettes.length > 0 && (
            <Card title="Répartition des ventes" subtitle="Montants réels par canal, sans mélanger les devises.">
              <div className="grid gap-5 lg:grid-cols-2">
                {recettes.map((recette) => {
                  const base = Math.max(recette.montant, 1);
                  const guichetPct = Math.round((recette.guichet / base) * 100);
                  const enLignePct = Math.round((recette.enLigne / base) * 100);
                  return (
                    <div key={recette.devise} className="rounded-[12px] border border-bordure p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-semibold text-navy">Ventes en {recette.devise}</p>
                        <Badge tone="neutre">{recette.billets} billet(s)</Badge>
                      </div>
                      <ChannelBar label="Guichet" amount={<Money amount={recette.guichet} currency={recette.devise} />} percent={guichetPct} tone="navy" />
                      <ChannelBar label="En ligne" amount={<Money amount={recette.enLigne} currency={recette.devise} />} percent={enLignePct} tone="accent" />
                    </div>
                  );
                })}
              </div>
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

            <Card
              title="Prochains départs programmés"
              actions={
                <Link href="/backoffice/planification" className="text-sm font-semibold text-accent hover:underline">
                  Planification
                </Link>
              }
            >
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
            peut vendre en ligne au même moment, et un passager refusé à l&apos;embarquement — imputé
            à la compagnie, avec pénalité.
          </Why>
        </section>
      )}

      {!utiliseBilletterie && !hasModule(acces, "PAIEMENT") && presence.horaires > 0 && (
        <Why>
          Vous êtes visible dans la recherche sans avoir rien changé à votre organisation. Le jour
          où vous voudrez aller plus loin — places réservables, sièges numérotés, paiement Mobile
          Money, billet QR, contrôle à l&apos;embarquement —{" "}
          <Link href="/backoffice/parametres" className="font-semibold text-accent underline">
            demandez l&apos;ouverture de la phase suivante
          </Link>
          . Rien ne s&apos;ajoute à votre écran tant que vous ne l&apos;avez pas demandé.
        </Why>
      )}

      {!utiliseBilletterie && hasModule(acces, "PAIEMENT") && (
        <Why>
          Vos voyageurs paient en ligne et reçoivent un billet numérique, sans que vous ayez à
          enregistrer un seul véhicule. Suivez les encaissements dans{" "}
          <Link href="/backoffice/billets" className="font-semibold text-accent underline">
            Paiements et billets
          </Link>
          .
        </Why>
      )}
    </div>
  );
}

function DashboardKpi({
  label,
  value,
  hint,
  icon,
  tone = "neutre",
}: {
  label: string;
  value: ReactNode;
  hint: string;
  icon: "ticket" | "cash" | "alert" | "calendar";
  tone?: "neutre" | "alerte" | "succes";
}) {
  return (
    <section className="rounded-[14px] border border-bordure bg-surface p-5 shadow-[0_4px_16px_rgba(8,22,45,0.04)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-texte-doux">{label}</p>
          <p className={`mt-2 text-3xl font-bold tabular-nums ${tone === "alerte" ? "text-alerte" : tone === "succes" ? "text-succes" : "text-navy"}`}>{value}</p>
        </div>
        <span className={`flex h-10 w-10 items-center justify-center rounded-[10px] ${tone === "alerte" ? "bg-alerte-doux text-alerte" : tone === "succes" ? "bg-succes-doux text-succes" : "bg-surface-alt text-navy"}`} aria-hidden>
          <KpiIcon name={icon} />
        </span>
      </div>
      <p className="mt-3 text-xs text-texte-doux">{hint}</p>
    </section>
  );
}

function ChannelBar({ label, amount, percent, tone }: { label: string; amount: ReactNode; percent: number; tone: "navy" | "accent" }) {
  return (
    <div className="mt-4">
      <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
        <span className="text-texte-doux">{label}</span>
        <span className="font-semibold tabular-nums text-navy">{amount} · {percent}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-alt">
        <div className={`h-full rounded-full ${tone === "navy" ? "bg-navy" : "bg-accent"}`} style={{ width: `${Math.min(100, percent)}%` }} />
      </div>
    </div>
  );
}

function KpiIcon({ name }: { name: "ticket" | "cash" | "alert" | "calendar" }) {
  if (name === "cash") return <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h4"/></svg>;
  if (name === "alert") return <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 9v5M12 17.5h.01"/></svg>;
  if (name === "calendar") return <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>;
  return <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 7a2 2 0 0 0 0 4v6h16v-6a2 2 0 0 0 0-4V5H4v2Z"/><path d="M9 8v6"/></svg>;
}
