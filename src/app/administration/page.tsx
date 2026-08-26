import Link from "next/link";
import { redirect } from "next/navigation";
import { currentSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { formatDateTime } from "@/lib/core/time";
import type { PartnerApplicationRow } from "@/lib/domain/partners";
import { Badge, Card, Empty, Table } from "@/components/ui";
import { MobemboLogo } from "@/components/brand";
import { ChoisirCompagnie, TraiterCandidature } from "./actions";

export const dynamic = "force-dynamic";

interface CompanyRow { id: string; name: string; status: string; agencies: number; routes: number; buses: number }

export default async function AdministrationPlateforme() {
  const session = await currentSession();
  if (!session || session.activeRole !== "SUPER_ADMIN") redirect("/guichet/connexion");
  const db = getDb();
  const [companies, applications] = await Promise.all([
    db.prepare<CompanyRow>(`SELECT c.id, c.name, c.status,
      (SELECT COUNT(*) FROM agencies a WHERE a.company_id = c.id) AS agencies,
      (SELECT COUNT(*) FROM routes r WHERE r.company_id = c.id) AS routes,
      (SELECT COUNT(*) FROM buses b WHERE b.company_id = c.id) AS buses
      FROM companies c ORDER BY c.name`).all(),
    db.prepare<PartnerApplicationRow>(`SELECT * FROM partner_applications ORDER BY CASE status WHEN 'EN_ATTENTE' THEN 0 ELSE 1 END, created_at DESC LIMIT 100`).all(),
  ]);

  return (
    <div className="min-h-full bg-fond">
      <header className="border-b border-bordure bg-surface"><div className="mx-auto flex min-h-16 max-w-[96rem] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8"><Link href="/administration" aria-label="Administration Mobembo"><MobemboLogo alt="" className="h-7 w-auto" /></Link><div className="text-right"><p className="text-sm font-semibold text-navy">{session.name}</p><p className="text-xs text-texte-doux">Super administration</p></div></div></header>
      <main className="mx-auto max-w-[96rem] space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-accent">Plateforme Mobembo</p><h1 className="mt-1 font-heading text-3xl font-bold tracking-tight text-navy">Compagnies et candidatures</h1><p className="mt-1 text-sm text-texte-doux">Validez les partenaires puis ouvrez leur back-office dans un contexte isolé.</p></div>
        <Card title="Demandes partenaires" subtitle="Une approbation crée la compagnie, sa première agence et le compte de sa direction.">
          {applications.length === 0 ? <Empty>Aucune candidature.</Empty> : <Table headers={["Reçue", "Compagnie", "Contact", "Projet", "État", "Action"]}>{applications.map((application) => <tr key={application.id} className="align-top"><td className="whitespace-nowrap px-2 py-2 text-xs text-texte-doux">{formatDateTime(application.created_at)}</td><td className="px-2 py-2"><p className="font-semibold">{application.company_name}</p><p className="text-xs text-texte-doux">{application.agency_name} · {application.city}</p></td><td className="px-2 py-2 text-sm">{application.contact_name}<p className="text-xs text-texte-doux">{application.phone}</p></td><td className="max-w-xs px-2 py-2 text-xs text-texte-doux">{application.destinations || "Destinations non précisées"}</td><td className="px-2 py-2"><Badge tone={application.status === "EN_ATTENTE" ? "attention" : application.status === "APPROUVEE" ? "succes" : "alerte"}>{application.status.toLowerCase().replace("_", " ")}</Badge></td><td className="px-2 py-2">{application.status === "EN_ATTENTE" ? <TraiterCandidature id={application.id} /> : "—"}</td></tr>)}</Table>}
        </Card>
        <Card title="Compagnies actives" subtitle="Sélectionnez une compagnie avant d'ouvrir son espace de gestion.">
          {companies.length === 0 ? <Empty>Aucune compagnie active.</Empty> : <Table headers={["Compagnie", "Agences", "Lignes", "Bus", "État", ""]}>{companies.map((company) => <tr key={company.id}><td className="px-2 py-2 font-semibold">{company.name}</td><td className="px-2 py-2 tabular-nums">{company.agencies}</td><td className="px-2 py-2 tabular-nums">{company.routes}</td><td className="px-2 py-2 tabular-nums">{company.buses}</td><td className="px-2 py-2"><Badge tone={company.status === "ACTIVE" ? "succes" : "alerte"}>{company.status.toLowerCase()}</Badge></td><td className="px-2 py-2 text-right"><ChoisirCompagnie id={company.id} active={session.companyId === company.id} /></td></tr>)}</Table>}
        </Card>
      </main>
    </div>
  );
}
