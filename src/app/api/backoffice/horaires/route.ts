import { authed, body } from "@/lib/api/handler";
import { errors } from "@/lib/core/errors";
import {
  companySchedules,
  createSchedule,
  quickUpdateSchedule,
  setScheduleStatus,
  updateSchedule,
  type ScheduleStatus,
} from "@/lib/domain/schedules";
import type { VehicleType } from "@/lib/domain/types";

/**
 * Horaires publiés d'une agence — Phase 1 §5.4 et §5.5.
 *
 * Le PATCH accepte deux formes : la mise à jour complète (formulaire d'édition)
 * et la mise à jour rapide d'un prix, d'une heure ou d'un quota. §5.5 exige que
 * la seconde tienne en « quelques actions » : elle ne renvoie donc que ce qui
 * change, sans imposer de repasser par tout le formulaire.
 */

const ROLES_LECTURE = ["ADMIN_COMPAGNIE", "GERANT_AGENCE", "GUICHETIER", "SUPER_ADMIN"] as const;
const ROLES_ECRITURE = ["ADMIN_COMPAGNIE", "GERANT_AGENCE", "SUPER_ADMIN"] as const;

interface HoraireBody {
  villeDepart: string;
  villeArrivee: string;
  heure: string;
  jours: number[];
  prixUsd?: number | null;
  prixCdf?: number | null;
  pointEmbarquement?: string | null;
  gps?: string | null;
  typeVehicule?: VehicleType;
  libelleVehicule?: string | null;
  dureeMin?: number | null;
  informations?: string | null;
  reservationOuverte?: boolean;
  placesEnLigne?: number;
  agenceId?: string | null;
}

export const GET = authed([...ROLES_LECTURE], async ({ session }) => {
  if (!session.companyId) throw errors.invalid("Compagnie non déterminée.");
  return { horaires: await companySchedules(session.companyId) };
});

export const POST = authed([...ROLES_ECRITURE], async ({ request, session }) => {
  if (!session.companyId) throw errors.invalid("Compagnie non déterminée.");
  const input = await body<HoraireBody>(request);
  return {
    horaire: await createSchedule({
      companyId: session.companyId,
      agencyId: input.agenceId ?? session.agencyId,
      originCity: input.villeDepart,
      destinationCity: input.villeArrivee,
      departureTime: input.heure,
      days: input.jours ?? [],
      priceUsd: input.prixUsd ?? null,
      priceCdf: input.prixCdf ?? null,
      boardingPoint: input.pointEmbarquement,
      boardingGps: input.gps,
      vehicleType: input.typeVehicule,
      vehicleLabel: input.libelleVehicule,
      durationEstMin: input.dureeMin ?? null,
      notes: input.informations,
      bookingEnabled: input.reservationOuverte,
      onlineQuota: input.placesEnLigne ?? 0,
      actor: { userId: session.userId, role: session.activeRole },
    }),
  };
});

export const PATCH = authed([...ROLES_ECRITURE], async ({ request, session }) => {
  if (!session.companyId) throw errors.invalid("Compagnie non déterminée.");
  const input = await body<
    Partial<HoraireBody> & {
      horaireId: string;
      mode?: "COMPLET" | "RAPIDE" | "STATUT";
      statut?: ScheduleStatus;
      motif?: string;
    }
  >(request);
  if (!input.horaireId) throw errors.invalid("Horaire non précisé.");
  const actor = { userId: session.userId, role: session.activeRole };

  if (input.mode === "STATUT") {
    await setScheduleStatus({
      scheduleId: input.horaireId,
      companyId: session.companyId,
      status: input.statut ?? "PUBLIE",
      reason: input.motif,
      actor,
    });
    return { ok: true };
  }

  if (input.mode === "RAPIDE" || !input.villeDepart) {
    return {
      horaire: await quickUpdateSchedule({
        scheduleId: input.horaireId,
        companyId: session.companyId,
        departureTime: input.heure,
        priceUsd: input.prixUsd,
        priceCdf: input.prixCdf,
        onlineQuota: input.placesEnLigne,
        actor,
      }),
    };
  }

  return {
    horaire: await updateSchedule(input.horaireId, {
      companyId: session.companyId,
      agencyId: input.agenceId ?? session.agencyId,
      originCity: input.villeDepart!,
      destinationCity: input.villeArrivee!,
      departureTime: input.heure!,
      days: input.jours ?? [],
      priceUsd: input.prixUsd ?? null,
      priceCdf: input.prixCdf ?? null,
      boardingPoint: input.pointEmbarquement,
      boardingGps: input.gps,
      vehicleType: input.typeVehicule,
      vehicleLabel: input.libelleVehicule,
      durationEstMin: input.dureeMin ?? null,
      notes: input.informations,
      bookingEnabled: input.reservationOuverte,
      onlineQuota: input.placesEnLigne ?? 0,
      actor,
    }),
  };
});
