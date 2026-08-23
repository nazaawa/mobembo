import Link from "next/link";
import { redirect } from "next/navigation";
import { currentSession } from "@/lib/auth/session";
import { openSessionFor, cashSessionSummary } from "@/lib/domain/cash";
import { tripsForAgencyToday } from "@/lib/domain/bookings";
import { getAgency } from "@/lib/domain/repo";
import { formatTime, formatDateTime } from "@/lib/core/time";
import { Card, Badge, Empty, Money, Stat, Why, Table } from "@/components/ui";
import { OuvertureCaisse, FermetureCaisse } from "./caisse";
import { Synchronisation } from "./synchronisation";

export const dynamic = "force-dynamic";

export default async function AccueilGuichet() {
  const session = await currentSession();
  if (!session || !["GUICHETIER", "GERANT_AGENCE"].includes(session.activeRole)) {
    redirect("/guichet/connexion");
  }
  if (!session.agencyId) {
    return <Empty>Aucune agence n&apos;est rattachée à ce rôle. Contactez la direction.</Empty>;
  }

  const agence = getAgency(session.agencyId);
  const caisse = openSessionFor(session.userId, session.agencyId);
  const resume = caisse ? cashSessionSummary(caisse.id) : null;
  const trajets = tripsForAgencyToday(session.agencyId);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{agence.name}</h1>
          <p className="text-sm text-texte-doux">
            {agence.city} · {agence.opening_hours ?? "horaires non renseignés"}
          </p>
        </div>
        <Synchronisation />
      </div>

      {!resume ? (
        <Card
          title="Ouvrir la caisse"
          subtitle="Aucune vente n'est possible sans session de caisse ouverte."
        >
          <OuvertureCaisse />
          <div className="mt-4">
            <Why>
              Le fond de caisse initial est le point de départ du calcul d&apos;écart en fin de
              journée. Le saisir faux, c&apos;est se retrouver avec un écart qu&apos;on ne saura
              pas expliquer.
            </Why>
          </div>
        </Card>
      ) : (
        <Card
          title="Session de caisse ouverte"
          subtitle={`Ouverte le ${formatDateTime(resume.session.opened_at)}`}
          actions={<Badge tone="succes">En cours</Badge>}
        >
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat
              label="Fond initial"
              value={<Money amount={resume.session.opening_float} currency={resume.session.currency} />}
            />
            <Stat
              label="Ventes"
              value={<Money amount={resume.ventes} currency={resume.session.currency} />}
              hint={`${resume.nbBillets} billet(s)`}
            />
            <Stat
              label="Remboursements"
              value={<Money amount={resume.remboursements} currency={resume.session.currency} />}
            />
            <Stat
              label="Attendu en caisse"
              value={<Money amount={resume.attendu} currency={resume.session.currency} />}
              tone="accent"
            />
          </div>

          <div className="mt-4">
            <FermetureCaisse
              sessionId={resume.session.id}
              attendu={resume.attendu}
              devise={resume.session.currency}
            />
          </div>

          {resume.mouvements.length > 0 && (
            <details className="mt-4">
              <summary className="cursor-pointer text-sm text-texte-doux hover:text-texte">
                Détail des mouvements ({resume.mouvements.length})
              </summary>
              <div className="mt-2">
                <Table headers={["Heure", "Type", "Détail", "Montant"]}>
                  {resume.mouvements.map((mouvement) => (
                    <tr key={mouvement.id}>
                      <td className="whitespace-nowrap px-2 py-1.5 text-texte-doux">
                        {formatTime(mouvement.created_at)}
                      </td>
                      <td className="px-2 py-1.5">
                        <Badge tone={mouvement.type === "VENTE" ? "succes" : "attention"}>
                          {mouvement.type}
                        </Badge>
                      </td>
                      <td className="px-2 py-1.5 text-xs text-texte-doux">{mouvement.label}</td>
                      <td className="px-2 py-1.5 text-right">
                        <Money amount={mouvement.amount} currency={mouvement.currency} />
                      </td>
                    </tr>
                  ))}
                </Table>
              </div>
            </details>
          )}
        </Card>
      )}

      <Card
        title="Départs du jour"
        subtitle="Filtrés sur votre agence, de −6 h à +36 h."
      >
        {trajets.length === 0 ? (
          <Empty>Aucun départ programmé au départ de cette agence.</Empty>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {trajets.map((trajet) => (
              <li key={trajet.id}>
                <Link
                  href={`/guichet/vente/${trajet.id}`}
                  className={`block rounded-lg border p-3 transition hover:border-accent ${
                    resume ? "border-bordure bg-surface" : "pointer-events-none border-bordure opacity-50"
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-lg font-semibold tabular-nums">
                      {trajet.departure_mode === "HORAIRE_FIXE"
                        ? formatTime(trajet.departure_datetime)
                        : "au remplissage"}
                    </span>
                    <Badge tone={trajet.category === "VIP" ? "accent" : "neutre"}>
                      {trajet.category}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm font-medium">
                    {trajet.origin_city} → {trajet.destination_city}
                  </p>
                  <p className="mt-0.5 text-xs text-texte-doux">
                    Bus {trajet.plate_number}
                    {" · "}
                    <span className={trajet.disponibles === 0 ? "text-alerte" : "text-succes"}>
                      {trajet.disponibles} place(s) au quota guichet
                    </span>
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {!resume && (
          <p className="mt-3 text-xs text-attention">
            Ouvrez d&apos;abord votre session de caisse pour accéder à la vente.
          </p>
        )}
      </Card>
    </div>
  );
}
