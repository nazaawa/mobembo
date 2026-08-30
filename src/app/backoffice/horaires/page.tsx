import Link from "next/link";
import { redirect } from "next/navigation";
import { currentSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { companySchedules } from "@/lib/domain/schedules";
import { companyProfile } from "@/lib/domain/directory";
import { reservationSummary } from "@/lib/domain/reservations";
import { companyAccess, hasModule } from "@/lib/domain/access";
import { Card, Stat, Why } from "@/components/ui";
import { GestionHoraires } from "./gestion";

export const dynamic = "force-dynamic";

/**
 * Phase 1 §5.4-5.5 — publier un trajet et le mettre à jour en quelques
 * actions. C'est l'écran qui décide si une agence reste sur Mobembo : s'il
 * demande un bus immatriculé, un plan de sièges et une grille tarifaire en
 * deux devises avant d'afficher quoi que ce soit, l'agence repart.
 */
export default async function Horaires() {
  const session = await currentSession();
  // Le layout et la page rendent en parallèle : le `redirect()` du layout
  // n'empêche pas cette fonction de s'exécuter. Sans cette garde, une session
  // expirée produit une exception au lieu d'une redirection propre.
  if (!session?.companyId) redirect("/guichet/connexion");
  const companyId = session!.companyId!;

  const acces = await companyAccess(companyId);
  const reservationOuverte = hasModule(acces, "RESERVATION");

  const [horaires, fiche, resume, agences] = await Promise.all([
    companySchedules(companyId),
    companyProfile(companyId),
    reservationSummary(companyId),
    getDb()
      .prepare<{ id: string; name: string; city: string }>(
        `SELECT id, name, city FROM agencies WHERE company_id = ? AND status = 'ACTIVE' ORDER BY city, name`,
      )
      .all(companyId),
  ]);

  const publies = horaires.filter((horaire) => horaire.status === "PUBLIE");
  const ouverts = publies.filter((horaire) => horaire.booking_enabled === 1);
  const placesOuvertes = ouverts.reduce((total, horaire) => total + horaire.online_quota, 0);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Trajets publiés</h1>
          <p className="mt-1 text-sm text-texte-doux">
            Ce que les voyageurs voient de vous sur Mobembo. Aucun bus ni plan de sièges n’est requis.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {fiche.slug && (
            <Link
              href={`/agences/${fiche.slug}`}
              target="_blank"
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-bordure bg-surface px-4 text-sm font-medium transition hover:bg-surface-alt"
            >
              Voir ma fiche publique
            </Link>
          )}
          <Link
            href="/backoffice/vitrine"
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-bordure bg-surface px-4 text-sm font-medium transition hover:bg-surface-alt"
          >
            Coordonnées de l’agence
          </Link>
        </div>
      </header>

      <div className={`grid gap-3 sm:grid-cols-2 ${reservationOuverte ? "lg:grid-cols-4" : "lg:grid-cols-2"}`}>
        <Stat label="Trajets publiés" value={publies.length} hint="visibles dans la recherche" />
        <Stat
          label="Villes desservies"
          value={new Set(publies.flatMap((h) => [h.origin_city, h.destination_city])).size}
          hint="au départ comme à l’arrivée"
        />
        {reservationOuverte && (
          <>
            <Stat
              label="Ouverts en réservation"
              value={ouverts.length}
              hint={`${placesOuvertes} place${placesOuvertes > 1 ? "s" : ""} au total`}
            />
            <Stat
              label="Réservations à venir"
              value={resume.aVenir}
              hint={<Link href="/backoffice/reservations" className="text-accent hover:underline">voir les passagers</Link>}
            />
          </>
        )}
      </div>

      {!fiche.phone && !fiche.whatsapp && (
        <p
          role="status"
          className="rounded-lg border border-attention/30 bg-attention-doux px-4 py-3 text-sm leading-6 text-attention"
        >
          <strong className="font-semibold">Ajoutez un numéro de téléphone.</strong> Sans lui, un
          voyageur qui trouve votre trajet ne peut pas vous joindre pour réserver.{" "}
          <Link href="/backoffice/vitrine" className="font-semibold underline">
            Compléter mes coordonnées
          </Link>
        </p>
      )}

      <Card
        title="Publier un trajet"
        subtitle="Ville de départ, destination, heure, jours, prix. Le reste est facultatif."
      >
        <GestionHoraires horaires={horaires} agences={agences} reservationOuverte={reservationOuverte} />
        <div className="mt-4">
          <Why>
            {reservationOuverte
              ? "Publier un trajet ici ne vous engage à rien : tant que vous n’ouvrez pas de places, le voyageur voit votre horaire et vous appelle, exactement comme aujourd’hui. Le jour où vous ouvrez des places, seules celles-là partent en ligne — le reste continue de se vendre à votre guichet."
              : "Publier un trajet ici ne vous engage à rien : le voyageur voit votre horaire, votre prix et votre numéro, et vous appelle exactement comme aujourd’hui. Vous ne vendez rien en ligne."}
          </Why>
        </div>
      </Card>
    </div>
  );
}
