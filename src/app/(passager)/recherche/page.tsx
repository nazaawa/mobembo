import Link from "next/link";
import { searchTrips, knownCities } from "@/lib/domain/planning";
import { activeListings } from "@/lib/domain/resale";
import { formatTime, formatDateTime, todayInKinshasa } from "@/lib/core/time";
import { Card, Badge, Empty, Money, Why } from "@/components/ui";
import { SearchForm } from "../search-form";

export const dynamic = "force-dynamic";

/** §2.5.2 Résultats — compagnie, heure, durée, prix, places, catégorie. */
export default async function Recherche(props: PageProps<"/recherche">) {
  const params = await props.searchParams;
  const origine = typeof params.origine === "string" ? params.origine : "";
  const destination = typeof params.destination === "string" ? params.destination : "";
  const date =
    typeof params.date === "string" ? params.date : todayInKinshasa();

  const villes = knownCities();
  const resultats =
    origine && destination ? searchTrips({ origin: origine, destination, day: date }) : [];

  return (
    <div className="space-y-5">
      <Card>
        <SearchForm
          villes={villes}
          defaultDate={date}
          compact
          initial={{ origine, destination, date }}
        />
      </Card>

      <div className="flex items-baseline justify-between">
        <h1 className="text-lg font-semibold tracking-tight">
          {origine} → {destination}
        </h1>
        <span className="text-xs text-texte-doux">
          {resultats.length} départ{resultats.length > 1 ? "s" : ""} le{" "}
          {new Date(`${date}T12:00:00Z`).toLocaleDateString("fr-CD", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </span>
      </div>

      {resultats.length === 0 ? (
        <Empty>
          Aucun départ à horaire fixe sur cet axe ce jour-là. Certains bus partent au remplissage :
          ceux-là ne se vendent qu&apos;au guichet, sans heure annoncée.
        </Empty>
      ) : (
        <ul className="space-y-3">
          {resultats.map((trajet) => {
            const reventes = activeListings(trajet.tripId);
            const placesTotal = trajet.placesEnLigne + reventes.length;
            return (
              <li key={trajet.tripId}>
                <Card className="transition hover:border-accent/50">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xl font-semibold tabular-nums">
                          {formatTime(trajet.depart)}
                        </span>
                        <Badge tone={trajet.categorie === "VIP" ? "accent" : "neutre"}>
                          {trajet.categorie}
                        </Badge>
                        {reventes.length > 0 && (
                          <Badge tone="attention">
                            {reventes.length} remis en vente
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm font-medium">{trajet.compagnie}</p>
                      <p className="text-xs text-texte-doux">
                        {trajet.dureeEstimeeMin
                          ? `Durée estimée ${Math.floor(trajet.dureeEstimeeMin / 60)} h ${String(
                              trajet.dureeEstimeeMin % 60,
                            ).padStart(2, "0")}`
                          : "Durée non communiquée"}
                        {" · "}
                        {formatDateTime(trajet.depart)}
                      </p>
                    </div>

                    <div className="text-right">
                      <div className="text-xl font-semibold">
                        <Money amount={trajet.prixUsd} currency="USD" />
                      </div>
                      <div className="text-xs text-texte-doux">
                        <Money amount={trajet.prixCdf} currency="CDF" />
                      </div>
                      <div className="mt-1 text-xs">
                        {placesTotal > 0 ? (
                          <span className={placesTotal <= 5 ? "text-attention" : "text-texte-doux"}>
                            {placesTotal} place{placesTotal > 1 ? "s" : ""} en ligne
                          </span>
                        ) : (
                          <span className="text-alerte">Complet en ligne</span>
                        )}
                      </div>
                      <Link
                        href={`/trajet/${trajet.tripId}`}
                        className="mt-2 inline-flex rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-texte hover:brightness-110"
                        aria-disabled={placesTotal === 0}
                      >
                        {placesTotal > 0 ? "Choisir un siège" : "Voir le plan"}
                      </Link>
                    </div>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <Why>
        Les places affichées ici sont celles du quota réservé à la vente en ligne. Le guichet vend
        son propre quota : c&apos;est ce qui permet à l&apos;agence de continuer à vendre quand
        elle perd internet, sans jamais vendre votre siège une seconde fois.
      </Why>
    </div>
  );
}
