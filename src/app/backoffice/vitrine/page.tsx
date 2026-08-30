import Link from "next/link";
import { redirect } from "next/navigation";
import { currentSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { companyProfile } from "@/lib/domain/directory";
import { Card, Why } from "@/components/ui";
import { FormulaireVitrine } from "./formulaire";

export const dynamic = "force-dynamic";

/**
 * Phase 1 §5.3 « Gestion du profil ».
 *
 * Le référencement est gratuit, mais il n'a de valeur pour l'agence que si le
 * voyageur peut la joindre. Cet écran est donc court et centré sur ce qui sert
 * réellement : un numéro qui décroche, un WhatsApp, une adresse.
 */
export default async function Vitrine() {
  const session = await currentSession();
  // Le layout et la page rendent en parallèle : le `redirect()` du layout
  // n'empêche pas cette fonction de s'exécuter. Sans cette garde, une session
  // expirée produit une exception au lieu d'une redirection propre.
  if (!session?.companyId) redirect("/guichet/connexion");
  const companyId = session!.companyId!;
  const fiche = await companyProfile(companyId);

  const points = (await getDb()
    .prepare(
      `SELECT id, name, city, address FROM agencies
        WHERE company_id = ? AND status = 'ACTIVE' ORDER BY city, name`,
    )
    .all(companyId)) as Array<{ id: string; name: string; city: string; address: string | null }>;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Fiche publique</h1>
          <p className="mt-1 text-sm text-texte-doux">
            Ce que les voyageurs lisent sur votre agence dans l’annuaire Mobembo.
          </p>
        </div>
        {fiche.slug && (
          <Link
            href={`/agences/${fiche.slug}`}
            target="_blank"
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-bordure bg-surface px-4 text-sm font-medium transition hover:bg-surface-alt"
          >
            Voir la fiche publique
          </Link>
        )}
      </header>

      <Card title={fiche.name} subtitle="Le nom de l’agence se modifie par l’équipe Mobembo.">
        <FormulaireVitrine fiche={fiche} />
        <div className="mt-4">
          <Why>
            Le téléphone et le WhatsApp publiés ici sont les seuls moyens qu’a un voyageur de vous
            joindre depuis un trajet que vous n’avez pas ouvert à la réservation en ligne. Une fiche
            sans contact réduit votre référencement à un affichage.
          </Why>
        </div>
      </Card>

      {points.length > 0 && (
        <Card
          title="Points de vente"
          subtitle="Affichés sur votre fiche publique. Ils se gèrent dans le référentiel."
        >
          <ul className="divide-y divide-bordure text-sm">
            {points.map((point) => (
              <li key={point.id} className="flex flex-wrap justify-between gap-2 py-2.5">
                <span className="font-medium">{point.name}</span>
                <span className="text-texte-doux">
                  {point.city}
                  {point.address && ` · ${point.address}`}
                </span>
              </li>
            ))}
          </ul>
          <Link
            href="/backoffice/referentiel"
            className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-accent hover:underline"
          >
            Gérer les points de vente
          </Link>
        </Card>
      )}
    </div>
  );
}
