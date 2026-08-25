import type { DbHandle } from "@/lib/db";
import { getDb, tx } from "@/lib/db";
import { newId } from "@/lib/core/ids";
import { nowIso, plusMinutes, iso, now } from "@/lib/core/time";
import { errors } from "@/lib/core/errors";
import { audit } from "./audit";
import { seatNumbersFor } from "./seat-map";
import type { Channel, SeatMapLayout, SeatStatus } from "./types";
import { CHANNELS, DEFAULT_POLICY } from "./types";

export interface TripSeatRow {
  id: string;
  trip_id: string;
  seat_number: string;
  status: SeatStatus;
  channel: Channel;
  locked_until: string | null;
  lock_session_id: string | null;
  lock_phone: string | null;
}

/**
 * Crée les sièges d'un trajet à partir du gabarit du bus et répartit les
 * quotas par canal (§2.3). Appelé à la création du trajet, avant toute vente.
 */
export async function materialiseTripSeats(
  db: DbHandle,
  tripId: string,
  seatMap: { rows: number; layout_json: string; disabled_seats: string },
  quotas: Record<Channel, number>,
): Promise<void> {
  const layout = JSON.parse(seatMap.layout_json) as SeatMapLayout;
  const disabled = JSON.parse(seatMap.disabled_seats) as string[];
  const seats = seatNumbersFor(seatMap.rows, layout, disabled);

  const total = CHANNELS.reduce((sum, c) => sum + (quotas[c] ?? 0), 0);
  if (total !== seats.length) {
    throw errors.invalid(
      `L'allocation par canal (${total} sièges) ne couvre pas le bus (${seats.length} sièges).`,
      { quotas, seatCount: seats.length },
    );
  }

  // Le guichet reçoit les rangées avant, la réserve compagnie les toutes
  // premières : un passager VIP ne se retrouve pas au fond par tirage.
  const order: Channel[] = [];
  for (const channel of ["RESERVE_COMPAGNIE", "GUICHET", "EN_LIGNE"] as Channel[]) {
    for (let i = 0; i < (quotas[channel] ?? 0); i++) order.push(channel);
  }

  const insert = db.prepare(
    `INSERT INTO trip_seats (id, trip_id, seat_number, status, channel)
     VALUES (?, ?, ?, 'DISPONIBLE', ?)`,
  );
  for (let index = 0; index < seats.length; index++) {
    await insert.run(newId("tst"), tripId, seats[index], order[index]);
  }

  const insertAllocation = db.prepare(
    `INSERT INTO trip_seat_allocations (id, trip_id, channel, quota, allocated_at)
     VALUES (?, ?, ?, ?, ?)`,
  );
  for (const channel of CHANNELS) {
    await insertAllocation.run(newId("tsa"), tripId, channel, quotas[channel] ?? 0, nowIso());
  }
}

/**
 * §2.5 : « Expiration : le siège retourne à son quota d'origine. » Le balayage
 * est fait à la lecture plutôt que par une tâche de fond — un verrou expiré
 * qu'aucun lecteur ne regarde n'a aucune conséquence, et cela évite qu'une
 * tâche cron en panne bloque silencieusement des sièges.
 */
export async function releaseExpiredLocks(db: DbHandle = getDb()): Promise<number> {
  const result = await db
    .prepare(
      `UPDATE trip_seats
          SET status = 'DISPONIBLE', locked_until = NULL,
              lock_session_id = NULL, lock_phone = NULL
        WHERE status = 'VERROUILLE' AND locked_until IS NOT NULL AND locked_until <= ?`,
    )
    .run(nowIso());
  return result.changes;
}

export async function listTripSeats(tripId: string, db: DbHandle = getDb()): Promise<TripSeatRow[]> {
  await releaseExpiredLocks(db);
  return db.prepare<TripSeatRow>(`SELECT * FROM trip_seats WHERE trip_id = ? ORDER BY seat_number`).all(tripId);
}

export interface SeatAvailability {
  channel: Channel;
  quota: number;
  disponibles: number;
  vendus: number;
  verrouilles: number;
}

export async function seatAvailability(
  tripId: string,
  db: DbHandle = getDb(),
): Promise<SeatAvailability[]> {
  await releaseExpiredLocks(db);
  const rows = await db
    .prepare<{
      channel: Channel;
      quota: number;
      disponibles: number | null;
      vendus: number | null;
      verrouilles: number | null;
    }>(
      `SELECT a.channel, a.quota,
              SUM(CASE WHEN s.status = 'DISPONIBLE' THEN 1 ELSE 0 END) AS disponibles,
              SUM(CASE WHEN s.status IN ('VENDU','EMBARQUE') THEN 1 ELSE 0 END) AS vendus,
              SUM(CASE WHEN s.status = 'VERROUILLE' THEN 1 ELSE 0 END) AS verrouilles
         FROM trip_seat_allocations a
         LEFT JOIN trip_seats s ON s.trip_id = a.trip_id AND s.channel = a.channel
        WHERE a.trip_id = ?
        GROUP BY a.channel, a.quota`,
    )
    .all(tripId);
  return rows.map((r) => ({
    channel: r.channel,
    quota: r.quota,
    disponibles: r.disponibles ?? 0,
    vendus: r.vendus ?? 0,
    verrouilles: r.verrouilles ?? 0,
  }));
}

export interface LockRequest {
  tripId: string;
  seatNumbers: string[];
  channel: Channel;
  sessionId: string;
  phone: string;
  minutes?: number;
  maxLocksPerPhone?: number;
}

export interface LockResult {
  seats: TripSeatRow[];
  lockedUntil: string;
}

/**
 * §2.5 Verrouillage temporaire. Toute la garantie « zéro siège vendu deux
 * fois » tient dans cette fonction.
 *
 * Sous SQLite, une transaction IMMEDIATE suffisait : le verrou d'écriture
 * global sérialisait tout, si bien qu'un SELECT suivi d'un UPDATE ne pouvait
 * jamais être doublé par un tiers entre les deux. Sous MySQL, les
 * transactions s'exécutent concurremment au niveau ligne : le SELECT seul ne
 * protège plus rien. La garantie tient maintenant à deux mécanismes
 * combinés :
 *  1. `SELECT ... FOR UPDATE` verrouille la ligne du siège dès la lecture —
 *     un second guichetier qui vise le même siège attend que la première
 *     transaction commite ou échoue, puis relit un état à jour (donc déjà
 *     VERROUILLE, et échoue proprement) au lieu de lire l'état périmé.
 *  2. Le nombre de lignes réellement affectées par l'UPDATE est vérifié :
 *     si `changes` n'est pas 1, le siège a échappé entre-temps — filet de
 *     sécurité qui ne dépend pas uniquement du bon usage de FOR UPDATE.
 *
 * Les sièges sont traités dans un ordre canonique (tri alphabétique) plutôt
 * que dans l'ordre soumis par le client : deux réservations qui se
 * chevauchent partiellement (ex. ["A1","A2"] vs ["A2","A1"]) posent alors
 * leurs verrous de ligne dans le même ordre, ce qui élimine les interblocages
 * qu'un ordre arbitraire pourrait provoquer.
 */
export async function lockSeats(request: LockRequest): Promise<LockResult> {
  const minutes = request.minutes ?? DEFAULT_POLICY.seatLockMinutes;
  const maxLocks = request.maxLocksPerPhone ?? DEFAULT_POLICY.maxLocksPerPhone;
  const seatNumbers = [...request.seatNumbers].sort();

  return tx(async (db) => {
    await releaseExpiredLocks(db);

    const held = await db
      .prepare<{ n: number }>(
        `SELECT COUNT(*) AS n FROM trip_seats
          WHERE lock_phone = ? AND status = 'VERROUILLE' AND lock_session_id <> ?`,
      )
      .get(request.phone, request.sessionId);
    if ((held?.n ?? 0) + seatNumbers.length > maxLocks) {
      throw errors.conflict(
        "TROP_DE_VERROUS",
        `Ce numéro détient déjà ${held?.n ?? 0} siège(s) en attente de paiement. Maximum ${maxLocks}.`,
      );
    }

    const lockedUntil = plusMinutes(minutes);
    const locked: TripSeatRow[] = [];

    for (const seatNumber of seatNumbers) {
      const seat = await db
        .prepare<TripSeatRow>(
          `SELECT * FROM trip_seats WHERE trip_id = ? AND seat_number = ? FOR UPDATE`,
        )
        .get(request.tripId, seatNumber);
      if (!seat) throw errors.notFound(`Siège ${seatNumber}`);

      if (seat.channel !== request.channel) {
        // §2.4 : « Les sièges du quota en ligne sont visibles mais non cliquables. »
        throw errors.conflict(
          "SIEGE_AUTRE_CANAL",
          `Le siège ${seatNumber} appartient au quota ${seat.channel}, pas à ${request.channel}.`,
        );
      }
      if (seat.status !== "DISPONIBLE") {
        throw errors.conflict(
          "SIEGE_INDISPONIBLE",
          `Le siège ${seatNumber} vient d'être pris.`,
          { seatNumber, status: seat.status },
        );
      }

      const result = await db
        .prepare(
          `UPDATE trip_seats
              SET status = 'VERROUILLE', locked_until = ?, lock_session_id = ?, lock_phone = ?
            WHERE id = ? AND status = 'DISPONIBLE'`,
        )
        .run(lockedUntil, request.sessionId, request.phone, seat.id);
      if (result.changes !== 1) {
        throw errors.conflict(
          "SIEGE_INDISPONIBLE",
          `Le siège ${seatNumber} vient d'être pris.`,
          { seatNumber },
        );
      }

      locked.push({
        ...seat,
        status: "VERROUILLE",
        locked_until: lockedUntil,
        lock_session_id: request.sessionId,
        lock_phone: request.phone,
      });
    }

    return { seats: locked, lockedUntil };
  });
}

/**
 * §2.5 : « Paiement initié dans le délai : le verrou est prolongé
 * automatiquement jusqu'à résolution, 15 minutes supplémentaires au maximum. »
 */
export async function extendLocks(
  db: DbHandle,
  tripId: string,
  sessionId: string,
  minutes = DEFAULT_POLICY.seatLockPaymentExtensionMinutes,
): Promise<string> {
  const until = plusMinutes(minutes);
  await db
    .prepare(
      `UPDATE trip_seats SET locked_until = ?
      WHERE trip_id = ? AND lock_session_id = ? AND status = 'VERROUILLE'`,
    )
    .run(until, tripId, sessionId);
  return until;
}

export async function releaseLocks(
  db: DbHandle,
  tripId: string,
  sessionId: string,
): Promise<number> {
  const result = await db
    .prepare(
      `UPDATE trip_seats
          SET status = 'DISPONIBLE', locked_until = NULL,
              lock_session_id = NULL, lock_phone = NULL
        WHERE trip_id = ? AND lock_session_id = ? AND status = 'VERROUILLE'`,
    )
    .run(tripId, sessionId);
  return result.changes;
}

/**
 * §2.3 : « Le gérant rééquilibre l'allocation à tout moment […] Chaque
 * rééquilibrage est tracé. » Seuls des sièges DISPONIBLE bougent : déplacer un
 * siège vendu reviendrait à le revendre.
 *
 * Même schéma de verrouillage que `lockSeats` : `FOR UPDATE` sur la sélection
 * des sièges candidats, puis vérification des lignes réellement affectées par
 * l'UPDATE — l'ancienne version ne relisait même pas `status = 'DISPONIBLE'`
 * dans son UPDATE, ce qui sous MySQL aurait pu déplacer un siège vendu entre
 * la lecture et l'écriture.
 */
export async function rebalanceChannel(params: {
  tripId: string;
  from: Channel;
  to: Channel;
  count: number;
  actor: { userId: string; role: string; companyId?: string | null };
  ip?: string | null;
  device?: string | null;
}): Promise<{ moved: string[] }> {
  return tx(async (db) => {
    await releaseExpiredLocks(db);
    const seats = await db
      .prepare<TripSeatRow>(
        `SELECT * FROM trip_seats
          WHERE trip_id = ? AND channel = ? AND status = 'DISPONIBLE'
          ORDER BY seat_number DESC LIMIT ?
          FOR UPDATE`,
      )
      .all(params.tripId, params.from, params.count);

    if (seats.length < params.count) {
      throw errors.conflict(
        "QUOTA_INSUFFISANT",
        `Seulement ${seats.length} siège(s) disponible(s) sur le quota ${params.from}.`,
      );
    }

    const update = db.prepare(
      `UPDATE trip_seats SET channel = ? WHERE id = ? AND status = 'DISPONIBLE'`,
    );
    let moved = 0;
    for (const seat of seats) {
      const result = await update.run(params.to, seat.id);
      moved += result.changes;
    }
    if (moved < params.count) {
      throw errors.conflict(
        "QUOTA_INSUFFISANT",
        `Seulement ${moved} siège(s) ont pu être déplacés sur le quota ${params.from}.`,
      );
    }

    const bump = db.prepare(
      `UPDATE trip_seat_allocations SET quota = quota + ?, allocated_at = ?, allocated_by = ?
        WHERE trip_id = ? AND channel = ?`,
    );
    await bump.run(-params.count, nowIso(), params.actor.userId, params.tripId, params.from);
    await bump.run(params.count, nowIso(), params.actor.userId, params.tripId, params.to);

    await audit(
      {
        userId: params.actor.userId,
        role: params.actor.role,
        companyId: params.actor.companyId,
        action: "REEQUILIBRAGE_ALLOCATION",
        entity: "trip",
        entityId: params.tripId,
        before: { channel: params.from, count: params.count },
        after: { channel: params.to, seats: seats.map((s) => s.seat_number) },
        ip: params.ip,
        device: params.device,
      },
      db,
    );

    return { moved: seats.map((s) => s.seat_number) };
  });
}

/** §2.8 BLOQUE_ADMIN : hors circuit, réservé compagnie. */
export async function blockSeat(params: {
  tripId: string;
  seatNumber: string;
  blocked: boolean;
  actor: { userId: string; role: string; companyId?: string | null };
}): Promise<void> {
  await tx(async (db) => {
    const seat = await db
      .prepare<TripSeatRow>(`SELECT * FROM trip_seats WHERE trip_id = ? AND seat_number = ? FOR UPDATE`)
      .get(params.tripId, params.seatNumber);
    if (!seat) throw errors.notFound(`Siège ${params.seatNumber}`);
    if (params.blocked && seat.status !== "DISPONIBLE") {
      throw errors.conflict("SIEGE_INDISPONIBLE", "Seul un siège disponible peut être bloqué.");
    }
    if (!params.blocked && seat.status !== "BLOQUE_ADMIN") {
      throw errors.conflict("SIEGE_NON_BLOQUE", "Ce siège n'est pas bloqué.");
    }
    await db
      .prepare(`UPDATE trip_seats SET status = ? WHERE id = ?`)
      .run(params.blocked ? "BLOQUE_ADMIN" : "DISPONIBLE", seat.id);
    await audit(
      {
        userId: params.actor.userId,
        role: params.actor.role,
        companyId: params.actor.companyId,
        action: params.blocked ? "BLOCAGE_SIEGE" : "DEBLOCAGE_SIEGE",
        entity: "trip_seat",
        entityId: seat.id,
        before: { status: seat.status },
        after: { status: params.blocked ? "BLOQUE_ADMIN" : "DISPONIBLE" },
      },
      db,
    );
  });
}

/** Sièges encore verrouillés pour une session de vente donnée. */
export async function seatsForSession(
  db: DbHandle,
  tripId: string,
  sessionId: string,
): Promise<TripSeatRow[]> {
  return db
    .prepare<TripSeatRow>(
      `SELECT * FROM trip_seats
        WHERE trip_id = ? AND lock_session_id = ? AND status = 'VERROUILLE'
        ORDER BY seat_number`,
    )
    .all(tripId, sessionId);
}

export function lockRemainingSeconds(seat: TripSeatRow): number {
  if (!seat.locked_until) return 0;
  return Math.max(
    0,
    Math.floor((new Date(seat.locked_until).getTime() - now().getTime()) / 1000),
  );
}

export { iso };
