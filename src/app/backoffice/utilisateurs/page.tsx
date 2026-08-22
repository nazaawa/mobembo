import { currentSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { formatDateTime } from "@/lib/core/time";
import { Card, Badge, Empty, Table, Why } from "@/components/ui";
import { FormulaireUtilisateur } from "./formulaire";

export const dynamic = "force-dynamic";

/** §1.5 Acteurs et rôles — §3.3 séparation stricte des rôles. */
export default async function Utilisateurs() {
  const session = await currentSession();
  const db = getDb();
  const companyId = session!.companyId!;
  const gestionnaire = ["ADMIN_COMPAGNIE", "SUPER_ADMIN"].includes(session!.activeRole);

  const utilisateurs = db
    .prepare(
      `SELECT u.id, u.phone, u.name, u.status, u.created_at,
              GROUP_CONCAT(ur.role || COALESCE(' @' || a.name, ''), ' | ') AS roles
         FROM users u
         JOIN user_roles ur ON ur.user_id = u.id
         LEFT JOIN agencies a ON a.id = ur.agency_id
        WHERE ur.company_id = ? AND ur.role <> 'PASSAGER'
        GROUP BY u.id ORDER BY u.name`,
    )
    .all(companyId) as Array<{
    id: string;
    phone: string;
    name: string;
    status: string;
    created_at: string;
    roles: string;
  }>;

  const agences = db
    .prepare(`SELECT id, name FROM agencies WHERE company_id = ? ORDER BY name`)
    .all(companyId) as Array<{ id: string; name: string }>;

  const bascules = db
    .prepare(
      `SELECT a.created_at, u.name AS utilisateur, a.before_json, a.after_json
         FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
        WHERE a.action = 'BASCULE_ROLE' AND (a.company_id = ? OR a.company_id IS NULL)
        ORDER BY a.created_at DESC LIMIT 15`,
    )
    .all(companyId) as Array<{
    created_at: string;
    utilisateur: string | null;
    before_json: string | null;
    after_json: string | null;
  }>;

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold tracking-tight">Utilisateurs</h1>

      <Card title="Comptes staff">
        {utilisateurs.length === 0 ? (
          <Empty>Aucun compte staff.</Empty>
        ) : (
          <Table headers={["Nom", "Téléphone", "Rôles", "État", "Créé le"]}>
            {utilisateurs.map((utilisateur) => (
              <tr key={utilisateur.id}>
                <td className="px-2 py-1.5 font-medium">{utilisateur.name}</td>
                <td className="px-2 py-1.5 font-mono text-xs">{utilisateur.phone}</td>
                <td className="px-2 py-1.5">
                  <div className="flex flex-wrap gap-1">
                    {utilisateur.roles.split(" | ").map((role, index) => (
                      <Badge key={index} tone="neutre">
                        {role}
                      </Badge>
                    ))}
                  </div>
                </td>
                <td className="px-2 py-1.5">
                  <Badge tone={utilisateur.status === "ACTIVE" ? "succes" : "alerte"}>
                    {utilisateur.status.toLowerCase()}
                  </Badge>
                </td>
                <td className="px-2 py-1.5 text-xs text-texte-doux">
                  {formatDateTime(utilisateur.created_at)}
                </td>
              </tr>
            ))}
          </Table>
        )}
        {gestionnaire && (
          <div className="mt-4 border-t border-bordure pt-4">
            <FormulaireUtilisateur agences={agences} />
          </div>
        )}
      </Card>

      <Card title="Bascules de rôle récentes">
        {bascules.length === 0 ? (
          <Empty>Aucune bascule enregistrée.</Empty>
        ) : (
          <Table headers={["Horodatage", "Utilisateur", "Depuis", "Vers"]}>
            {bascules.map((bascule, index) => (
              <tr key={index}>
                <td className="whitespace-nowrap px-2 py-1.5 text-xs text-texte-doux">
                  {formatDateTime(bascule.created_at)}
                </td>
                <td className="px-2 py-1.5">{bascule.utilisateur ?? "—"}</td>
                <td className="px-2 py-1.5 text-xs text-texte-doux">{bascule.before_json}</td>
                <td className="px-2 py-1.5 text-xs text-texte-doux">{bascule.after_json}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Why>
        Un utilisateur cumule plusieurs rôles — un gérant est souvent aussi guichetier — mais jamais
        dans la même session. La bascule est explicite et tracée : c&apos;est ce qui permet
        d&apos;attribuer une annulation à un gérant plutôt qu&apos;au guichetier qu&apos;il était
        cinq minutes plus tôt.
      </Why>
    </div>
  );
}
