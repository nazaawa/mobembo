import Link from "next/link";
import { currentSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { formatDateTime } from "@/lib/core/time";
import { Card, Badge, Empty, Money, Table, Why } from "@/components/ui";
import { FormulaireTrajet } from "./formulaire";

export const dynamic = "force-dynamic";

/** §2.2 Planification des trajets. */
export default async function Planification() {
  const session = await currentSession();
  const db = getDb();
  const companyId = session!.companyId!;
  const gestionnaire = ["ADMIN_COMPAGNIE", "SUPER_ADMIN"].includes(session!.activeRole);

  const trajets = (await db
    .prepare(
      `SELECT t.*, r.origin_city, r.destination_city, b.plate_number, b.category, a.name AS agence,
              (SELECT COUNT(*) FROM trip_seats s WHERE s.trip_id = t.id) AS sieges,
              (SELECT COUNT(*) FROM trip_seats s WHERE s.trip_id = t.id AND s.status IN ('VENDU','EMBARQUE')) AS vendus,
              (SELECT COUNT(*) FROM trip_seats s WHERE s.trip_id = t.id AND s.channel='GUICHET' AND s.status='DISPONIBLE') AS libresGuichet,
              (SELECT COUNT(*) FROM trip_seats s WHERE s.trip_id = t.id AND s.channel='EN_LIGNE' AND s.status='DISPONIBLE') AS libresEnLigne,
              (SELECT price_usd FROM trip_prices p WHERE p.trip_id = t.id LIMIT 1) AS prixUsd
         FROM trips t
         JOIN routes r ON r.id = t.route_id
         JOIN buses b ON b.id = t.bus_id
         LEFT JOIN agencies a ON a.id = t.origin_agency_id
        WHERE t.company_id = ?
        ORDER BY t.departure_datetime DESC LIMIT 80`,
    )
    .all(companyId)) as Array<{
    id: string;
    departure_datetime: string;
    departure_mode: string;
    status: string;
    origin_city: string;
    destination_city: string;
    plate_number: string;
    category: string;
    agence: string | null;
    sieges: number;
    vendus: number;
    libresGuichet: number;
    libresEnLigne: number;
    prixUsd: number | null;
  }>;

  const lignes = (await db
    .prepare(`SELECT id, origin_city, destination_city FROM routes WHERE company_id = ? ORDER BY origin_city`)
    .all(companyId)) as Array<{ id: string; origin_city: string; destination_city: string }>;
  const bus = (await db
    .prepare(
      `SELECT b.id, b.plate_number, b.category, m.seat_count FROM buses b
         JOIN seat_maps m ON m.id = b.seat_map_id
        WHERE b.company_id = ? AND b.status = 'ACTIF' ORDER BY b.plate_number`,
    )
    .all(companyId)) as Array<{
    id: string;
    plate_number: string;
    category: string;
    seat_count: number;
  }>;
  const agences = (await db
    .prepare(`SELECT id, name FROM agencies WHERE company_id = ? ORDER BY name`)
    .all(companyId)) as Array<{ id: string; name: string }>;

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold tracking-tight">Planification</h1>

      {gestionnaire && (
        <Card
          title="Programmer un départ"
          subtitle="Un trajet = un bus + une ligne + une date et heure + une grille tarifaire."
        >
          <FormulaireTrajet lignes={lignes} bus={bus} agences={agences} />
          <div className="mt-4">
            <Why>
              Un départ à l&apos;heure annoncée est le seul mode vendable en ligne. Un départ au
              remplissage n&apos;affiche aucune heure et se vend uniquement au guichet : vendre en
              ligne une promesse d&apos;horaire que l&apos;opérateur ne tient pas est la première
              cause de litige.
            </Why>
          </div>
        </Card>
      )}

      <Card title="Départs programmés">
        {trajets.length === 0 ? (
          <Empty>Aucun trajet planifié.</Empty>
        ) : (
          <Table
            headers={["Départ", "Ligne", "Bus", "Mode", "Prix", "Guichet", "En ligne", "Rempli", "État"]}
          >
            {trajets.map((trajet) => (
              <tr key={trajet.id}>
                <td className="whitespace-nowrap px-2 py-1.5 text-xs">
                  <Link
                    href={`/backoffice/trajet/${trajet.id}`}
                    className="font-medium hover:text-accent"
                  >
                    {formatDateTime(trajet.departure_datetime)}
                  </Link>
                </td>
                <td className="px-2 py-1.5">
                  {trajet.origin_city} → {trajet.destination_city}
                  {trajet.agence && (
                    <div className="text-[10px] text-texte-doux">{trajet.agence}</div>
                  )}
                </td>
                <td className="px-2 py-1.5 font-mono text-xs">{trajet.plate_number}</td>
                <td className="px-2 py-1.5">
                  <Badge tone={trajet.departure_mode === "HORAIRE_FIXE" ? "accent" : "attention"}>
                    {trajet.departure_mode === "HORAIRE_FIXE" ? "horaire fixe" : "remplissage"}
                  </Badge>
                </td>
                <td className="px-2 py-1.5 text-right">
                  {trajet.prixUsd ? <Money amount={trajet.prixUsd} currency="USD" /> : "—"}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-texte-doux">
                  {trajet.libresGuichet}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-texte-doux">
                  {trajet.libresEnLigne}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {trajet.vendus}/{trajet.sieges}
                </td>
                <td className="px-2 py-1.5">
                  <Badge
                    tone={
                      trajet.status === "ANNULE"
                        ? "alerte"
                        : trajet.status === "CLOTURE"
                          ? "neutre"
                          : "succes"
                    }
                  >
                    {trajet.status.toLowerCase()}
                  </Badge>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
