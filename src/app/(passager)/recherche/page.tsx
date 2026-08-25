import { searchTrips, knownCities } from "@/lib/domain/planning";
import { todayInKinshasa } from "@/lib/core/time";
import { Card, Empty, Why } from "@/components/ui";
import { SearchForm } from "../search-form";
import { ResultatsTrajets } from "./resultats";

export const dynamic = "force-dynamic";

/** §2.5.2 Résultats — compagnie, heure, durée, prix, places, catégorie. */
export default async function Recherche(props: PageProps<"/recherche">) {
  const params = await props.searchParams;
  const origine = typeof params.origine === "string" ? params.origine : "";
  const destination = typeof params.destination === "string" ? params.destination : "";
  const date =
    typeof params.date === "string" ? params.date : todayInKinshasa();

  const villes = await knownCities();
  const resultats =
    origine && destination ? await searchTrips({ origin: origine, destination, day: date }) : [];

  const dateLisible = new Date(`${date}T12:00:00Z`).toLocaleDateString("fr-CD", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="space-y-6 pb-8">
      <Card className="overflow-visible border-navy/10 shadow-[0_18px_50px_rgba(8,22,45,0.08)]">
        <SearchForm
          villes={villes}
          defaultDate={date}
          compact
          initial={{ origine, destination, date }}
        />
      </Card>

      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-accent">
            Départs disponibles
          </p>
          <h1 className="mt-1 font-heading text-2xl font-bold tracking-tight text-navy sm:text-3xl">
            {origine || "Départ"} <span className="text-accent">→</span> {destination || "Arrivée"}
          </h1>
        </div>
        <p className="text-sm text-texte-doux">
          {resultats.length} départ{resultats.length > 1 ? "s" : ""} · {dateLisible}
        </p>
      </header>

      {resultats.length === 0 ? (
        <Empty>
          Aucun départ à horaire fixe sur cet axe ce jour-là. Certains bus partent au remplissage :
          ceux-là ne se vendent qu&apos;au guichet, sans heure annoncée.
        </Empty>
      ) : (
        <ResultatsTrajets resultats={resultats} />
      )}

      <Why>
        Les places affichées ici sont celles du quota réservé à la vente en ligne. Le guichet vend
        son propre quota : c&apos;est ce qui permet à l&apos;agence de continuer à vendre quand
        elle perd internet, sans jamais vendre votre siège une seconde fois.
      </Why>
    </div>
  );
}
