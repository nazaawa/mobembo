import Link from "next/link";
import { redirect } from "next/navigation";
import { currentSession } from "@/lib/auth/session";
import { openSessionFor, cashSessionSummary } from "@/lib/domain/cash";
import { tripsForAgencyToday } from "@/lib/domain/bookings";
import { getAgency } from "@/lib/domain/repo";
import { companyAccess, hasModule } from "@/lib/domain/access";
import { ModuleFerme } from "@/components/module-ferme";
import { formatTime, formatDateTime } from "@/lib/core/time";
import { Card, Badge, Empty, Money, Stat, Why, Table } from "@/components/ui";
import { OuvertureCaisse, FermetureCaisse } from "./caisse";
import { Synchronisation } from "./synchronisation";

export const dynamic = "force-dynamic";

export default async function AccueilGuichet() {
  const session = await currentSession();
  if (!session || session.activeRole !== "GUICHETIER") {
    redirect("/guichet/connexion");
  }
  if (!session.agencyId) {
    return <Empty>Aucune agence n&apos;est rattachée à ce rôle. Contactez la direction.</Empty>;
  }
  // §29 : la vente au guichet appartient à la phase 4. Tant qu'elle n'est pas
  // ouverte, l'agent voit ce que le module apporte plutôt qu'une caisse vide.
  const acces = await companyAccess(session.companyId!);
  if (!hasModule(acces, "ERP")) {
    return (
      <ModuleFerme
        module="ERP"
        peutDemander={false}
        retourHref="/guichet/connexion"
        retourLabel="Changer de rôle"
      />
    );
  }

  const agence = await getAgency(session.agencyId);
  const caisse = await openSessionFor(session.userId, session.agencyId);
  const resume = caisse ? await cashSessionSummary(caisse.id) : null;
  const trajets = await tripsForAgencyToday(session.agencyId);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-accent">Poste de vente</p>
          <h1 className="mt-1 font-heading text-3xl font-bold tracking-tight text-navy">{agence.name}</h1>
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
          <ul className="space-y-2">
            {trajets.map((trajet) => {
              const contenu = (
                <>
                  <div className="md:min-w-28">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-texte-doux">Départ</p>
                    <p className="mt-1 text-xl font-bold tabular-nums text-navy">
                      {trajet.departure_mode === "HORAIRE_FIXE" ? formatTime(trajet.departure_datetime) : "Remplissage"}
                    </p>
                  </div>
                  <div className="min-w-0 md:flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-navy">{trajet.origin_city} <span className="text-accent">→</span> {trajet.destination_city}</p>
                      <Badge tone={trajet.category === "VIP" ? "accent" : "neutre"}>{trajet.category}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-texte-doux">Bus {trajet.plate_number} · quota agence sécurisé</p>
                  </div>
                  <div className="md:min-w-36 md:text-right">
                    <p className={`text-sm font-semibold ${trajet.disponibles === 0 ? "text-alerte" : "text-succes"}`}>{trajet.disponibles} place(s)</p>
                    <p className="text-[11px] text-texte-doux">disponibles au guichet</p>
                  </div>
                  <span className={`inline-flex min-h-11 items-center justify-center rounded-[10px] px-4 text-sm font-bold ${resume ? "bg-accent text-white" : "bg-surface-alt text-texte-doux"}`}>
                    {resume ? "Vendre" : "Caisse fermée"}
                  </span>
                </>
              );
              return (
                <li key={trajet.id}>
                  {resume ? (
                    <Link href={`/guichet/vente/${trajet.id}`} className="grid gap-4 rounded-[12px] border border-bordure bg-surface p-4 transition hover:border-accent/50 hover:shadow-[0_8px_24px_rgba(8,22,45,0.06)] md:grid-cols-[auto_minmax(0,1fr)_auto_auto] md:items-center">{contenu}</Link>
                  ) : (
                    <div aria-disabled="true" className="grid gap-4 rounded-[12px] border border-bordure bg-surface p-4 opacity-60 md:grid-cols-[auto_minmax(0,1fr)_auto_auto] md:items-center">{contenu}</div>
                  )}
                </li>
              );
            })}
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
