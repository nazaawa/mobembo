import Link from "next/link";
import { redirect } from "next/navigation";
import { currentSession } from "@/lib/auth/session";
import { companyAccess, hasModule } from "@/lib/domain/access";
import { ModuleFerme } from "@/components/module-ferme";
import {
  companyReservations,
  reservationSummary,
  settleFinishedReservations,
} from "@/lib/domain/reservations";
import { companySchedules } from "@/lib/domain/schedules";
import { Card, Empty, Stat, Why } from "@/components/ui";
import { ListeReservations } from "./liste";

export const dynamic = "force-dynamic";

/**
 * Phase 2 §11.2 « Suivi des réservations ».
 *
 * §12 : « Les réservations doivent être visibles rapidement par l'agence. »
 * Cet écran est donc trié par heure de départ à venir, et le manifeste d'un
 * départ se lit d'un coup d'œil : qui vient, combien de places, quel numéro.
 */
export default async function ReservationsAgence(props: PageProps<"/backoffice/reservations">) {
  const params = await props.searchParams;
  const session = await currentSession();
  // Le layout et la page rendent en parallèle : le `redirect()` du layout
  // n'empêche pas cette fonction de s'exécuter. Sans cette garde, une session
  // expirée produit une exception au lieu d'une redirection propre.
  if (!session?.companyId) redirect("/guichet/connexion");
  const acces = await companyAccess(session!.companyId!);
  if (!hasModule(acces, "RESERVATION")) return <ModuleFerme module="RESERVATION" />;
  const companyId = session!.companyId!;
  const portee = params.portee === "TOUTES" ? "TOUTES" : "A_VENIR";
  const horaireId = typeof params.horaire === "string" ? params.horaire : null;

  await settleFinishedReservations();

  const [reservations, resume, horaires] = await Promise.all([
    companyReservations({ companyId, scope: portee, scheduleId: horaireId }),
    reservationSummary(companyId),
    companySchedules(companyId),
  ]);

  const ouverts = horaires.filter((horaire) => horaire.booking_enabled === 1);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Réservations Mobembo</h1>
        <p className="mt-1 text-sm text-texte-doux">
          Les places retenues en ligne sur les départs que vous avez ouverts. Le paiement se fait
          chez vous.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Réservations à venir" value={resume.aVenir} />
        <Stat label="Passagers attendus" value={resume.placesAVenir} hint="places réservées" />
        <Stat label="Départs aujourd’hui" value={resume.aujourdhui} />
        <Stat
          label="Annulations (7 jours)"
          value={resume.annulees7j}
          tone={resume.annulees7j > 0 ? "alerte" : "neutre"}
        />
      </div>

      {ouverts.length === 0 ? (
        <Card title="Aucun départ ouvert à la réservation">
          <p className="text-sm leading-6 text-texte-doux">
            Vos trajets publiés sont visibles par les voyageurs, mais aucun ne propose de place en
            ligne. Ouvrez-en quelques-unes sur un départ pour recevoir vos premières réservations —
            vous gardez le reste de la capacité pour votre guichet.
          </p>
          <Link
            href="/backoffice/horaires"
            className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg bg-accent px-4 text-sm font-medium text-accent-texte transition hover:brightness-110"
          >
            Ouvrir des places
          </Link>
        </Card>
      ) : (
        <Card
          title={portee === "A_VENIR" ? "Départs à venir" : "Historique complet"}
          subtitle={`${reservations.length} réservation${reservations.length > 1 ? "s" : ""}`}
          actions={
            <div className="flex flex-wrap gap-1.5">
              <Filtre href="/backoffice/reservations" actif={portee === "A_VENIR" && !horaireId}>
                À venir
              </Filtre>
              <Filtre href="/backoffice/reservations?portee=TOUTES" actif={portee === "TOUTES"}>
                Tout l’historique
              </Filtre>
            </div>
          }
        >
          {ouverts.length > 1 && (
            <div className="mb-4 flex flex-wrap gap-1.5">
              <Filtre
                href={`/backoffice/reservations${portee === "TOUTES" ? "?portee=TOUTES" : ""}`}
                actif={!horaireId}
              >
                Tous les départs
              </Filtre>
              {ouverts.map((horaire) => (
                <Filtre
                  key={horaire.id}
                  href={`/backoffice/reservations?horaire=${horaire.id}${portee === "TOUTES" ? "&portee=TOUTES" : ""}`}
                  actif={horaireId === horaire.id}
                >
                  {horaire.origin_city} → {horaire.destination_city} · {horaire.departure_time}
                </Filtre>
              ))}
            </div>
          )}

          {reservations.length === 0 ? (
            <Empty>
              Aucune réservation {portee === "A_VENIR" ? "à venir" : "enregistrée"} sur cette
              sélection.
            </Empty>
          ) : (
            <ListeReservations reservations={reservations} />
          )}

          <div className="mt-4">
            <Why>
              Annuler une réservation rend immédiatement la place au quota du jour et envoie un SMS
              au voyageur avec votre motif. C’est la seule information qu’il recevra : écrivez-la
              comme vous la diriez au téléphone.
            </Why>
          </div>
        </Card>
      )}
    </div>
  );
}

function Filtre({
  href,
  actif,
  children,
}: {
  href: string;
  actif: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={actif ? "page" : undefined}
      className={`inline-flex min-h-11 items-center rounded-lg border px-3 text-xs font-semibold transition ${
        actif
          ? "border-navy bg-navy text-white"
          : "border-bordure bg-surface text-texte-doux hover:border-accent hover:text-accent"
      }`}
    >
      {children}
    </Link>
  );
}
