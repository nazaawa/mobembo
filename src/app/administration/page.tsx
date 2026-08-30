import Link from "next/link";
import { redirect } from "next/navigation";
import { currentSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { daysAgo, formatDateTime } from "@/lib/core/time";
import type { PartnerApplicationRow } from "@/lib/domain/partners";
import { Badge, Card, Empty, Stat, Table } from "@/components/ui";
import { MobemboLogo } from "@/components/brand";
import { platformCoverage } from "@/lib/domain/offers";
import { parseModules } from "@/lib/domain/modules";
import { BasculerAnnuaire, ChoisirCompagnie, ModulesAgence, TraiterCandidature } from "./actions";

export const dynamic = "force-dynamic";

interface CompanyRow { id: string; name: string; status: string; listed: number; modules: string | null; agencies: number; horaires: number; buses: number }

export default async function AdministrationPlateforme() {
  const session = await currentSession();
  if (!session || session.activeRole !== "SUPER_ADMIN") redirect("/guichet/connexion");
  const db = getDb();
  const [companies, applications, couverture, axesRecherches] = await Promise.all([
    db.prepare<CompanyRow>(`SELECT c.id, c.name, c.status, c.listed, c.modules,
      (SELECT COUNT(*) FROM agencies a WHERE a.company_id = c.id) AS agencies,
      (SELECT COUNT(*) FROM schedules s WHERE s.company_id = c.id AND s.status = 'PUBLIE') AS horaires,
      (SELECT COUNT(*) FROM buses b WHERE b.company_id = c.id) AS buses
      FROM companies c ORDER BY c.name`).all(),
    db.prepare<PartnerApplicationRow>(`SELECT * FROM partner_applications ORDER BY CASE status WHEN 'EN_ATTENTE' THEN 0 ELSE 1 END, created_at DESC LIMIT 100`).all(),
    platformCoverage(db),
    // §7 : « trajets les plus recherchés » — l'indicateur qui dit quel axe
    // démarcher ensuite, et lesquels ne renvoient encore aucun résultat.
    db.prepare<{ origine: string; destination: string; recherches: number; sansResultat: number }>(
      `SELECT origin_city AS origine, destination_city AS destination,
              COUNT(*) AS recherches,
              SUM(CASE WHEN results_count = 0 THEN 1 ELSE 0 END) AS sansResultat
         FROM search_events WHERE created_at >= ?
        GROUP BY origin_city, destination_city
        ORDER BY recherches DESC LIMIT 8`,
    ).all(daysAgo(30)),
  ]);

  return (
    <div className="min-h-full bg-fond">
      <header className="border-b border-bordure bg-surface"><div className="mx-auto flex min-h-16 max-w-[96rem] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8"><Link href="/administration" aria-label="Administration Mobembo"><MobemboLogo alt="" className="h-7 w-auto" /></Link><div className="text-right"><p className="text-sm font-semibold text-navy">{session.name}</p><p className="text-xs text-texte-doux">Super administration</p></div></div></header>
      <main className="mx-auto max-w-[96rem] space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-accent">Plateforme Mobembo</p><h1 className="mt-1 font-heading text-3xl font-bold tracking-tight text-navy">Compagnies et candidatures</h1><p className="mt-1 text-sm text-texte-doux">Validez les partenaires puis ouvrez leur back-office dans un contexte isolé.</p></div>
        <section aria-labelledby="indicateurs-phase-1">
          <h2 id="indicateurs-phase-1" className="sr-only">Indicateurs de couverture</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <Stat label="Agences référencées" value={couverture.agences} />
            <Stat label="Agences actives" value={couverture.agencesActives} hint="au moins un horaire publié" />
            <Stat label="Trajets publiés" value={couverture.horaires} />
            <Stat label="Villes couvertes" value={couverture.villes} />
            <Stat label="Recherches (30 j)" value={couverture.recherches30j} />
            <Stat label="Réservations (30 j)" value={couverture.reservations30j} />
          </div>
        </section>

        <Card
          title="Ce que les voyageurs cherchent"
          subtitle="30 derniers jours. Un axe très cherché sans résultat est une agence à démarcher."
        >
          {axesRecherches.length === 0 ? (
            <Empty>Aucune recherche enregistrée pour l&apos;instant.</Empty>
          ) : (
            <Table headers={["Axe", "Recherches", "Sans résultat"]}>
              {axesRecherches.map((axe) => (
                <tr key={`${axe.origine}-${axe.destination}`}>
                  <td className="px-2 py-2 font-medium">{axe.origine} → {axe.destination}</td>
                  <td className="px-2 py-2 tabular-nums">{axe.recherches}</td>
                  <td className="px-2 py-2 tabular-nums">
                    {axe.sansResultat > 0 ? (
                      <span className="text-attention">{axe.sansResultat}</span>
                    ) : (
                      <span className="text-texte-doux">0</span>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        <Card title="Demandes partenaires" subtitle="Une approbation crée la compagnie, sa première agence et le compte de sa direction.">
          {applications.length === 0 ? <Empty>Aucune candidature.</Empty> : <Table headers={["Reçue", "Compagnie", "Contact", "Projet", "État", "Action"]}>{applications.map((application) => <tr key={application.id} className="align-top"><td className="whitespace-nowrap px-2 py-2 text-xs text-texte-doux">{formatDateTime(application.created_at)}</td><td className="px-2 py-2"><p className="flex items-center gap-1.5 font-semibold">{application.company_name}{application.application_type === "INDEPENDANT" && <Badge tone="attention">Indépendant</Badge>}</p><p className="text-xs text-texte-doux">{application.agency_name} · {application.city}</p></td><td className="px-2 py-2 text-sm">{application.contact_name}<p className="text-xs text-texte-doux">{application.phone}</p></td><td className="max-w-xs px-2 py-2 text-xs text-texte-doux">{application.destinations || "Destinations non précisées"}</td><td className="px-2 py-2"><Badge tone={application.status === "EN_ATTENTE" ? "attention" : application.status === "APPROUVEE" ? "succes" : "alerte"}>{application.status.toLowerCase().replace("_", " ")}</Badge></td><td className="px-2 py-2">{application.status === "EN_ATTENTE" ? <TraiterCandidature id={application.id} /> : "—"}</td></tr>)}</Table>}
        </Card>
        <Card title="Compagnies actives" subtitle="Ouvrez une phase quand l'agence en exprime le besoin — chaque module coché ajoute des écrans à son back-office.">
          {companies.length === 0 ? <Empty>Aucune compagnie active.</Empty> : <Table headers={["Compagnie", "Agences", "Trajets", "Bus", "Phases ouvertes", "Annuaire", ""]}>{companies.map((company) => <tr key={company.id} className="align-top"><td className="px-2 py-2"><div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{company.name}</span><Badge tone={company.status === "ACTIVE" ? "succes" : "alerte"}>{company.status.toLowerCase()}</Badge></div></td><td className="px-2 py-2 tabular-nums">{company.agencies}</td><td className="px-2 py-2 tabular-nums">{company.horaires}</td><td className="px-2 py-2 tabular-nums">{company.buses}</td><td className="px-2 py-2"><ModulesAgence id={company.id} modules={parseModules(company.modules)} /></td><td className="px-2 py-2"><div className="flex flex-col items-start gap-1.5"><Badge tone={company.listed === 1 ? "succes" : "attention"}>{company.listed === 1 ? "référencée" : "retirée"}</Badge><BasculerAnnuaire id={company.id} reference={company.listed === 1} /></div></td><td className="px-2 py-2 text-right"><ChoisirCompagnie id={company.id} active={session.companyId === company.id} /></td></tr>)}</Table>}
        </Card>
      </main>
    </div>
  );
}
