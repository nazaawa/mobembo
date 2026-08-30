"use client";

import Link from "next/link";
import type { ScheduleDay } from "@/lib/domain/schedules";

const JOUR_COURT = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];

/**
 * Le choix du jour est une liste de départs réels, pas un calendrier : un
 * service qui ne roule que trois jours par semaine ne doit pas obliger le
 * voyageur à tester les dates une par une pour trouver lesquelles existent.
 */
export function ChoixDate({
  scheduleId,
  jours,
  selection,
  reservable,
}: {
  scheduleId: string;
  jours: ScheduleDay[];
  selection: string | null;
  reservable: boolean;
}) {
  return (
    <ul className="mt-4 flex snap-x gap-2 overflow-x-auto pb-2">
      {jours.map((jour) => {
        const date = new Date(`${jour.date}T12:00:00.000+01:00`);
        const actif = jour.date === selection;
        const complet = reservable && jour.restantes === 0;
        return (
          <li key={jour.date} className="snap-start">
            <Link
              href={`/horaire/${scheduleId}?date=${jour.date}`}
              scroll={false}
              aria-current={actif ? "date" : undefined}
              className={`flex min-h-[5.25rem] w-[5.5rem] flex-col items-center justify-center gap-0.5 rounded-[10px] border px-2 text-center transition ${
                actif
                  ? "border-accent bg-accent text-white"
                  : "border-bordure bg-surface text-navy hover:border-accent hover:text-accent"
              }`}
            >
              <span className={`text-[11px] font-semibold ${actif ? "text-white/80" : "text-texte-doux"}`}>
                {JOUR_COURT[date.getUTCDay()]}
              </span>
              <span className="font-heading text-xl font-bold tabular-nums">{date.getUTCDate()}</span>
              <span className={`text-[11px] font-medium ${actif ? "text-white/80" : "text-texte-doux"}`}>
                {reservable
                  ? complet
                    ? "complet"
                    : `${jour.restantes} pl.`
                  : date.toLocaleDateString("fr-CD", { month: "short", timeZone: "UTC" })}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
