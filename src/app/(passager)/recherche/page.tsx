import Link from "next/link";
import { searchableCities, searchOffers } from "@/lib/domain/offers";
import { recordSearch } from "@/lib/domain/reservations";
import { formatDay, todayInKinshasa } from "@/lib/core/time";
import { Card } from "@/components/ui";
import { SearchForm } from "../search-form";
import { ResultatsTrajets } from "./resultats";

export const dynamic = "force-dynamic";

/**
 * §4.3 « Résultats de recherche » — agence, heure, prix indicatif, point de
 * départ, dernière mise à jour. Les départs vendus en ligne et ceux
 * simplement référencés cohabitent dans la même liste : c'est la couverture
 * réelle de l'axe, et c'est elle qui rend Mobembo utile dès la phase 1.
 */
export default async function Recherche(props: PageProps<"/recherche">) {
  const params = await props.searchParams;
  const origine = typeof params.origine === "string" ? params.origine : "";
  const destination = typeof params.destination === "string" ? params.destination : "";
  const date = typeof params.date === "string" ? params.date : todayInKinshasa();

  const villes = await searchableCities();
  const resultats =
    origine && destination ? await searchOffers({ origin: origine, destination, day: date }) : [];

  if (origine && destination) {
    // §7 : « nombre de recherches, trajets les plus recherchés ». Journalisé
    // sans identifiant de personne — l'indicateur porte sur l'axe, pas sur qui
    // cherche.
    await recordSearch({ origin: origine, destination, day: date, results: resultats.length });
  }

  const compagnies = new Set(resultats.map((offre) => offre.compagnie)).size;
  const reservables = resultats.filter((offre) => offre.bookingMode !== "CONTACT").length;

  return (
    <div className="space-y-6 pb-8">
      <Card className="overflow-visible border-navy/10 shadow-[0_18px_50px_rgba(8,22,45,0.08)]">
        <SearchForm villes={villes} defaultDate={date} compact initial={{ origine, destination, date }} />
      </Card>

      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-[-0.02em] text-navy sm:text-4xl">
            {origine || "Départ"} <span className="text-accent">→</span> {destination || "Arrivée"}
          </h1>
          <p className="mt-1.5 text-sm text-texte-doux">{formatDay(date)}</p>
        </div>
        {resultats.length > 0 && (
          <p className="text-sm text-texte-doux">
            {resultats.length} départ{resultats.length > 1 ? "s" : ""} ·{" "}
            {compagnies} agence{compagnies > 1 ? "s" : ""}
            {reservables > 0 && ` · ${reservables} réservable${reservables > 1 ? "s" : ""} en ligne`}
          </p>
        )}
      </header>

      {resultats.length === 0 ? (
        <div className="rounded-[14px] border border-dashed border-bordure bg-surface px-6 py-14 text-center">
          <h2 className="font-heading text-xl font-bold text-navy">
            Aucun départ publié sur cet axe ce jour-là
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-texte-doux">
            Toutes les agences ne publient pas encore leurs horaires. Consultez l’annuaire pour
            joindre directement celles qui desservent {destination || "cette destination"}, ou
            essayez une autre date.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              href="/agences"
              className="inline-flex min-h-12 items-center gap-2 rounded-[10px] bg-navy px-5 text-sm font-bold text-white transition hover:bg-navy-profond"
            >
              Voir les agences <span aria-hidden>→</span>
            </Link>
            <Link
              href="/partenaires/inscription"
              className="inline-flex min-h-12 items-center rounded-[10px] border border-bordure px-5 text-sm font-bold text-navy transition hover:border-accent hover:text-accent"
            >
              Je suis une agence sur cet axe
            </Link>
          </div>
        </div>
      ) : (
        <ResultatsTrajets resultats={resultats} />
      )}

      {resultats.length > 0 && (
        <p className="rounded-[14px] border border-bordure bg-surface px-4 py-3.5 text-sm leading-6 text-texte-doux">
          Les horaires et prix sont publiés par les agences elles-mêmes, avec leur date de dernière
          mise à jour. Les départs marqués « réservation en ligne » retirent votre place du quota
          que l’agence a ouvert sur Mobembo ; les autres se réservent en appelant l’agence.
        </p>
      )}
    </div>
  );
}
