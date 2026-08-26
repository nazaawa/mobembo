import { currentSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { seatGrid, LAYOUT_PRESETS } from "@/lib/domain/seat-map";
import { detectSequenceGaps } from "@/lib/domain/tickets";
import type { SeatMapLayout } from "@/lib/domain/types";
import { Card, Badge, Empty, Table, Why } from "@/components/ui";
import { EditeurPlan, FormulaireBus, FormulaireLigne, FormulaireAgence } from "./formulaires";

export const dynamic = "force-dynamic";

/** §2.1 Référentiel : compagnies, agences, bus, plans de sièges, lignes. */
export default async function Referentiel() {
  const session = await currentSession();
  const db = getDb();
  const companyId = session!.companyId!;
  const gestionnaire = ["ADMIN_COMPAGNIE", "SUPER_ADMIN"].includes(session!.activeRole);
  const agencyId = session!.activeRole === "GERANT_AGENCE" ? session!.agencyId : null;

  const agences = (await db
    .prepare(`SELECT * FROM agencies WHERE company_id = ? AND (? IS NULL OR id = ?) ORDER BY name`)
    .all(companyId, agencyId, agencyId)) as Array<{
    id: string;
    name: string;
    city: string;
    address: string | null;
    opening_hours: string | null;
    ticket_sequence: number;
  }>;

  const plans = (await db
    .prepare<{
      id: string;
      name: string;
      rows: number;
      layout_json: string;
      disabled_seats: string;
      seat_count: number;
    }>(`SELECT *, row_count AS \`rows\` FROM seat_maps WHERE company_id = ? ORDER BY name`)
    .all(companyId));

  const bus = (await db
    .prepare(
      `SELECT b.*, m.name AS plan, m.seat_count AS places FROM buses b
         JOIN seat_maps m ON m.id = b.seat_map_id
        WHERE b.company_id = ? ORDER BY b.plate_number`,
    )
    .all(companyId)) as Array<{
    id: string;
    plate_number: string;
    category: string;
    status: string;
    plan: string;
    places: number;
  }>;

  const lignes = (await db
    .prepare(`SELECT * FROM routes WHERE company_id = ? ORDER BY origin_city, destination_city`)
    .all(companyId)) as Array<{
    id: string;
    origin_city: string;
    destination_city: string;
    distance_km: number | null;
    duration_est_min: number | null;
  }>;

  // detectSequenceGaps est async : précalculé pour chaque agence, le rendu
  // JSX ci-dessous reste synchrone.
  const sequencesParAgence = new Map(
    await Promise.all(
      agences.map(async (a) => [a.id, await detectSequenceGaps(a.id, db)] as const),
    ),
  );

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold tracking-tight">Référentiel</h1>

      <Card title="Agences" subtitle="Points de vente physiques rattachés à la compagnie.">
        {agences.length === 0 ? (
          <Empty>Aucune agence.</Empty>
        ) : (
          <Table headers={["Agence", "Ville", "Adresse", "Horaires", "Séquence billets"]}>
            {agences.map((agence) => {
              const sequence = sequencesParAgence.get(agence.id)!;
              return (
                <tr key={agence.id}>
                  <td className="px-2 py-1.5 font-medium">{agence.name}</td>
                  <td className="px-2 py-1.5 text-texte-doux">{agence.city}</td>
                  <td className="px-2 py-1.5 text-xs text-texte-doux">{agence.address ?? "—"}</td>
                  <td className="px-2 py-1.5 text-xs text-texte-doux">
                    {agence.opening_hours ?? "—"}
                  </td>
                  <td className="px-2 py-1.5">
                    <span className="tabular-nums">#{agence.ticket_sequence}</span>{" "}
                    {sequence.gaps.length > 0 ? (
                      <Badge tone="alerte">
                        {sequence.gaps.length} trou(s) : {sequence.gaps.slice(0, 5).join(", ")}
                      </Badge>
                    ) : (
                      <Badge tone="succes">continue</Badge>
                    )}
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
        {gestionnaire && (
          <div className="mt-4 border-t border-bordure pt-4">
            <FormulaireAgence />
          </div>
        )}
      </Card>

      <Card
        title="Plans de sièges"
        subtitle="Gabarits réutilisables. Aucun plan n'est codé en dur."
      >
        {plans.length === 0 ? (
          <Empty>Aucun plan de sièges.</Empty>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {plans.map((plan) => {
              const layout = JSON.parse(plan.layout_json) as SeatMapLayout;
              const desactives = JSON.parse(plan.disabled_seats) as string[];
              const grille = seatGrid(plan.rows, layout, desactives);
              return (
                <div key={plan.id} className="rounded-lg border border-bordure p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="text-sm font-medium">{plan.name}</h3>
                    <Badge tone="accent">{plan.seat_count} places</Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-texte-doux">
                    {plan.rows} rangées · disposition{" "}
                    {layout.columns.filter((c) => c !== "aisle").length} sièges par rangée
                    {desactives.length > 0 && ` · ${desactives.length} désactivé(s)`}
                  </p>
                  <div className="mt-2 inline-block rounded bg-surface-alt p-1.5">
                    {grille.map((rangee, index) => (
                      <div key={index} className="flex gap-0.5">
                        {rangee.map((siege, colonne) => (
                          <span
                            key={colonne}
                            className={`h-2.5 w-2.5 rounded-[2px] ${
                              siege === null
                                ? layout.columns[colonne] === "aisle"
                                  ? "bg-transparent"
                                  : "border border-dashed border-bordure"
                                : "bg-accent/50"
                            }`}
                            title={siege ?? undefined}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {gestionnaire && (
          <div className="mt-4 border-t border-bordure pt-4">
            <EditeurPlan dispositions={LAYOUT_PRESETS} />
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Bus">
          {bus.length === 0 ? (
            <Empty>Aucun bus.</Empty>
          ) : (
            <Table headers={["Plaque", "Catégorie", "Plan", "Places", "État"]}>
              {bus.map((vehicule) => (
                <tr key={vehicule.id}>
                  <td className="px-2 py-1.5 font-mono font-medium">{vehicule.plate_number}</td>
                  <td className="px-2 py-1.5">
                    <Badge tone={vehicule.category === "VIP" ? "accent" : "neutre"}>
                      {vehicule.category}
                    </Badge>
                  </td>
                  <td className="px-2 py-1.5 text-xs text-texte-doux">{vehicule.plan}</td>
                  <td className="px-2 py-1.5 tabular-nums">{vehicule.places}</td>
                  <td className="px-2 py-1.5 text-xs text-texte-doux">{vehicule.status}</td>
                </tr>
              ))}
            </Table>
          )}
          {gestionnaire && (
            <div className="mt-4 border-t border-bordure pt-4">
              <FormulaireBus plans={plans.map((p) => ({ id: p.id, name: p.name }))} />
            </div>
          )}
        </Card>

        <Card title="Lignes">
          {lignes.length === 0 ? (
            <Empty>Aucune ligne.</Empty>
          ) : (
            <Table headers={["Ligne", "Distance", "Durée estimée"]}>
              {lignes.map((ligne) => (
                <tr key={ligne.id}>
                  <td className="px-2 py-1.5 font-medium">
                    {ligne.origin_city} → {ligne.destination_city}
                  </td>
                  <td className="px-2 py-1.5 tabular-nums text-texte-doux">
                    {ligne.distance_km ? `${ligne.distance_km} km` : "—"}
                  </td>
                  <td className="px-2 py-1.5 text-texte-doux">
                    {ligne.duration_est_min
                      ? `${Math.floor(ligne.duration_est_min / 60)} h ${String(
                          ligne.duration_est_min % 60,
                        ).padStart(2, "0")}`
                      : "—"}
                  </td>
                </tr>
              ))}
            </Table>
          )}
          {gestionnaire && (
            <div className="mt-4 border-t border-bordure pt-4">
              <FormulaireLigne />
            </div>
          )}
        </Card>
      </div>

      <Why>
        La séquence de billets d&apos;une agence doit être continue. Un trou signifie qu&apos;un
        billet a été émis puis effacé, ou qu&apos;un carnet parallèle circule : l&apos;alerte part
        automatiquement au gérant.
      </Why>
    </div>
  );
}
