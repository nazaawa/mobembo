import { currentSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { formatDateTime } from "@/lib/core/time";
import { Card, Badge, Empty, Table, Why } from "@/components/ui";

export const dynamic = "force-dynamic";

interface Entree {
  id: string;
  created_at: string;
  utilisateur: string | null;
  role: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  before_json: string | null;
  after_json: string | null;
  ip: string | null;
  device: string | null;
}

const ACTIONS_SENSIBLES = new Set([
  "ANNULATION_BILLET",
  "REEQUILIBRAGE_ALLOCATION",
  "MODIFICATION_PARAMETRES",
  "ANNULATION_TRAJET",
  "GRILLE_RESPONSABILITE",
  "ARBITRAGE_PAIEMENT",
  "BASCULE_ROLE",
]);

/**
 * §2.11 « Journal d'audit filtrable et exportable » — §3.3 conservation 24
 * mois, en écriture seule. Cette page ne propose aucune suppression : c'est le
 * cœur du dispositif anti-fraude.
 */
export default async function JournalAudit(props: PageProps<"/backoffice/audit">) {
  const params = await props.searchParams;
  const session = await currentSession();
  if (!session || !["ADMIN_COMPAGNIE", "SUPER_ADMIN"].includes(session.activeRole)) redirect("/backoffice");
  const filtreAction = typeof params.action === "string" ? params.action : "";

  const db = getDb();
  const entrees = filtreAction
    ? await db
        .prepare<Entree>(
          `SELECT a.*, u.name AS utilisateur FROM audit_log a
             LEFT JOIN users u ON u.id = a.user_id
             WHERE (a.company_id = ? OR a.company_id IS NULL) AND a.action = ?
             ORDER BY a.created_at DESC LIMIT 300`,
        )
        .all(session!.companyId, filtreAction)
    : await db
        .prepare<Entree>(
          `SELECT a.*, u.name AS utilisateur FROM audit_log a
             LEFT JOIN users u ON u.id = a.user_id
             WHERE (a.company_id = ? OR a.company_id IS NULL)
             ORDER BY a.created_at DESC LIMIT 300`,
        )
        .all(session!.companyId);

  const actions = (await db
    .prepare(
      `SELECT action, COUNT(*) AS n FROM audit_log
        WHERE company_id = ? OR company_id IS NULL
        GROUP BY action ORDER BY n DESC`,
    )
    .all(session!.companyId)) as Array<{ action: string; n: number }>;

  const exportUrl = `/api/backoffice/audit?format=csv${filtreAction ? `&action=${filtreAction}` : ""}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Journal d&apos;audit</h1>
          <p className="text-sm text-texte-doux">
            Écriture seule, conservation 24 mois. 300 entrées les plus récentes.
          </p>
        </div>
        <a
          href={exportUrl}
          className="rounded-lg border border-bordure bg-surface px-4 py-2 text-sm font-medium hover:bg-surface-alt"
        >
          Exporter en CSV
        </a>
      </div>

      <Card title="Filtrer par action">
        <div className="flex flex-wrap gap-2">
          <a
            href="/backoffice/audit"
            className={`rounded-lg border px-3 py-1.5 text-xs ${
              filtreAction ? "border-bordure" : "border-accent bg-accent-doux text-accent"
            }`}
          >
            Toutes
          </a>
          {actions.map((action) => (
            <a
              key={action.action}
              href={`/backoffice/audit?action=${action.action}`}
              className={`rounded-lg border px-3 py-1.5 text-xs ${
                filtreAction === action.action
                  ? "border-accent bg-accent-doux text-accent"
                  : "border-bordure hover:bg-surface-alt"
              }`}
            >
              {action.action.replace(/_/g, " ").toLowerCase()}{" "}
              <span className="text-texte-doux">{action.n}</span>
            </a>
          ))}
        </div>
      </Card>

      <Card>
        {entrees.length === 0 ? (
          <Empty>Aucune entrée.</Empty>
        ) : (
          <Table headers={["Horodatage", "Utilisateur", "Action", "Entité", "Avant → Après", "Appareil"]}>
            {entrees.map((entree) => (
              <tr key={entree.id} className="align-top">
                <td className="whitespace-nowrap px-2 py-1.5 text-xs text-texte-doux">
                  {formatDateTime(entree.created_at)}
                </td>
                <td className="px-2 py-1.5">
                  <div className="text-xs font-medium">{entree.utilisateur ?? "système"}</div>
                  {entree.role && (
                    <div className="text-[10px] text-texte-doux">{entree.role}</div>
                  )}
                </td>
                <td className="px-2 py-1.5">
                  <Badge tone={ACTIONS_SENSIBLES.has(entree.action) ? "attention" : "neutre"}>
                    {entree.action.replace(/_/g, " ").toLowerCase()}
                  </Badge>
                </td>
                <td className="px-2 py-1.5 text-xs text-texte-doux">
                  {entree.entity}
                  {entree.entity_id && (
                    <div className="font-mono text-[10px]">{entree.entity_id}</div>
                  )}
                </td>
                <td className="max-w-md px-2 py-1.5 text-[11px] text-texte-doux">
                  {entree.before_json && (
                    <div className="truncate" title={entree.before_json}>
                      <span className="text-alerte">−</span> {entree.before_json}
                    </div>
                  )}
                  {entree.after_json && (
                    <div className="truncate" title={entree.after_json}>
                      <span className="text-succes">+</span> {entree.after_json}
                    </div>
                  )}
                </td>
                <td className="px-2 py-1.5 text-[10px] text-texte-doux">
                  {entree.ip && <div>{entree.ip}</div>}
                  {entree.device && (
                    <div className="max-w-[10rem] truncate" title={entree.device}>
                      {entree.device}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Why>
        Chaque action sensible — annulation, remise, rééquilibrage, changement de tarif, bascule de
        rôle — enregistre l&apos;utilisateur, l&apos;appareil, l&apos;adresse IP, l&apos;horodatage
        et les valeurs avant et après. Rien n&apos;est modifiable ni supprimable depuis cette page.
      </Why>
    </div>
  );
}
