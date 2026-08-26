import Link from "next/link";
import { redirect } from "next/navigation";
import { currentSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { formatDateTime } from "@/lib/core/time";
import { Card, Badge, Empty, Why } from "@/components/ui";
import { ManifestesEnCache } from "./cache";

export const dynamic = "force-dynamic";

/**
 * L'heure courante est lue hors du corps du composant : un rendu doit rester
 * pur (§ règles React), et Date.now() ne l'est pas.
 */
async function fenetre(): Promise<{ debut: string; fin: string }> {
  const maintenant = Date.now();
  return {
    debut: new Date(maintenant - 12 * 3_600_000).toISOString(),
    fin: new Date(maintenant + 24 * 3_600_000).toISOString(),
  };
}

interface LigneTrajet {
  id: string;
  departure_datetime: string;
  status: string;
  origin_city: string;
  destination_city: string;
  plate_number: string;
  vendus: number;
  embarques: number;
}

export default async function AccueilControle() {
  const session = await currentSession();
  if (!session || session.activeRole !== "CONTROLEUR") {
    redirect("/guichet/connexion");
  }
  if (!session.agencyId) return <Empty>Aucune agence n&apos;est rattachée à ce rôle.</Empty>;

  // Les horodatages sont des chaînes ISO 8601 : la fenêtre "-12h / +24h" est
  // calculée côté JS et liée en paramètre plutôt qu'avec datetime('now', …),
  // fonction SQLite absente de MySQL.
  const { debut: fenetreDebut, fin: fenetreFin } = await fenetre();
  const trajets = await getDb()
    .prepare<LigneTrajet>(
      `SELECT t.id, t.departure_datetime, t.status, r.origin_city, r.destination_city,
              b.plate_number,
              (SELECT COUNT(*) FROM tickets k WHERE k.trip_id = t.id
                AND k.status IN ('EMIS','EN_REVENTE','EMBARQUE')) AS vendus,
              (SELECT COUNT(*) FROM tickets k WHERE k.trip_id = t.id AND k.status = 'EMBARQUE') AS embarques
         FROM trips t
         JOIN routes r ON r.id = t.route_id
         JOIN buses b ON b.id = t.bus_id
        WHERE t.company_id = ? AND t.origin_agency_id = ?
          AND t.status IN ('PLANIFIE','EN_VENTE','PARTI')
          AND t.departure_datetime BETWEEN ? AND ?
        ORDER BY t.departure_datetime`,
    )
    .all(session.companyId, session.agencyId, fenetreDebut, fenetreFin);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Embarquement</h1>
        <p className="mt-1 text-sm text-texte-doux">
          Téléchargez le manifeste tant que vous avez du réseau. Le scan fonctionne ensuite sans
          connexion.
        </p>
      </div>

      <ManifestesEnCache />

      <Card title="Départs à contrôler">
        {trajets.length === 0 ? (
          <Empty>Aucun départ dans les prochaines 24 heures.</Empty>
        ) : (
          <ul className="space-y-2">
            {trajets.map((trajet) => (
              <li key={trajet.id}>
                <Link
                  href={`/controle/${trajet.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-bordure bg-surface p-3 transition hover:border-accent"
                >
                  <div>
                    <p className="font-medium">
                      {trajet.origin_city} → {trajet.destination_city}
                    </p>
                    <p className="mt-0.5 text-xs text-texte-doux">
                      {formatDateTime(trajet.departure_datetime)} · bus {trajet.plate_number}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Badge tone={trajet.status === "PARTI" ? "attention" : "neutre"}>
                      {trajet.status}
                    </Badge>
                    <span className="tabular-nums text-texte-doux">
                      {trajet.embarques}/{trajet.vendus} embarqués
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Why>
        Le manifeste embarque la clé de vérification de votre compagnie. Un QR se valide alors
        localement, par calcul de signature — sans réseau, sans latence, et sans qu&apos;un faux
        billet imprimé ailleurs puisse passer.
      </Why>
    </div>
  );
}
