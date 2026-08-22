import type { Database } from "better-sqlite3";
import { getDb, tx } from "@/lib/db";
import { newId } from "@/lib/core/ids";
import { nowIso, formatTime } from "@/lib/core/time";
import { errors } from "@/lib/core/errors";
import { audit } from "./audit";
import { verifyQr } from "./qr";
import { expireNoShows } from "./tickets";
import { getCompany, getTicket, getTrip, tripDetail, type TicketRow } from "./repo";

/**
 * §2.7 Embarquement.
 *
 * « Le contrôleur télécharge le manifeste du voyage avant le départ, à la gare,
 * avec réseau. Scan QR hors-ligne : validation par vérification locale de
 * signature. Aucun appel réseau nécessaire. »
 */
export interface ManifestEntry {
  ticketId: string;
  ticketCode: string;
  seat: string;
  passengerName: string;
  passengerPhone: string;
  status: string;
  /** §2.7 : un billet annulé pour revente figure avec un statut explicite. */
  invalide: boolean;
  motifInvalidite?: string;
  nouveauTitulaire?: string;
  dejaScanneA?: string | null;
}

export interface Manifest {
  tripId: string;
  companyId: string;
  compagnie: string;
  ligne: string;
  depart: string;
  plaque: string;
  /** Clé HMAC de la compagnie : permet la vérification hors-ligne (§3.1). */
  cleVerification: string;
  genereA: string;
  entries: ManifestEntry[];
  totalValides: number;
}

export function buildManifest(tripId: string, db: Database = getDb()): Manifest {
  const trip = tripDetail(tripId, db);
  const company = getCompany(trip.company_id, db);

  const rows = db
    .prepare(
      `SELECT t.id, t.ticket_code, t.passenger_name, t.passenger_phone, t.status,
              s.seat_number,
              (SELECT MAX(scanned_at) FROM boarding_scans bs
                WHERE bs.ticket_id = t.id AND bs.result = 'ACCEPTE') AS scanned_at,
              (SELECT nt.passenger_name FROM tickets nt
                WHERE nt.parent_ticket_id = t.id
                  AND nt.status IN ('EMIS','EMBARQUE') LIMIT 1) AS successeur
         FROM tickets t
         JOIN trip_seats s ON s.id = t.trip_seat_id
        WHERE t.trip_id = ?
        ORDER BY s.seat_number`,
    )
    .all(tripId) as Array<{
    id: string;
    ticket_code: string;
    passenger_name: string;
    passenger_phone: string;
    status: string;
    seat_number: string;
    scanned_at: string | null;
    successeur: string | null;
  }>;

  const entries: ManifestEntry[] = rows.map((row) => {
    const valide = ["EMIS", "EN_REVENTE", "EMBARQUE"].includes(row.status);
    let motif: string | undefined;
    if (row.status === "ANNULE_REVENDU") motif = "Billet revendu — QR invalidé";
    else if (row.status === "TRANSFERE") motif = "Billet transféré à un tiers";
    else if (row.status === "ANNULE") motif = "Billet annulé par l'agence";
    else if (row.status === "EXPIRE") motif = "Billet expiré (no-show)";

    return {
      ticketId: row.id,
      ticketCode: row.ticket_code,
      seat: row.seat_number,
      passengerName: row.passenger_name,
      passengerPhone: row.passenger_phone,
      status: row.status,
      invalide: !valide,
      motifInvalidite: motif,
      nouveauTitulaire: row.successeur ?? undefined,
      dejaScanneA: row.scanned_at,
    };
  });

  return {
    tripId,
    companyId: trip.company_id,
    compagnie: company.name,
    ligne: `${trip.route.origin_city} → ${trip.route.destination_city}`,
    depart: trip.departure_datetime,
    plaque: trip.bus.plate_number,
    cleVerification: company.qr_secret,
    genereA: nowIso(),
    entries,
    totalValides: entries.filter((e) => !e.invalide).length,
  };
}

export type ScanOutcome =
  | { result: "ACCEPTE"; ticket: TicketRow; seat: string; passager: string }
  | { result: "DEJA_SCANNE"; ticket: TicketRow; seat: string; premierScanA: string }
  | { result: "REFUSE"; motif: string; detail?: string; nouveauTitulaire?: string };

/**
 * Scan côté serveur — utilisé quand le réseau est là, et par la
 * synchronisation des scans hors-ligne. La vérification de signature est
 * identique à celle que le terminal fait localement.
 */
export function scanTicket(params: {
  tripId: string;
  rawQr: string;
  scannedBy?: string | null;
  deviceId?: string | null;
  /** Horodatage du terminal — informatif, jamais décisionnel (§3.1). */
  clientTime?: string | null;
}): ScanOutcome {
  return tx((db) => {
    const trip = getTrip(params.tripId, db);
    const company = getCompany(trip.company_id, db);

    const verification = verifyQr(params.rawQr, [company.qr_secret, company.qr_secret_previous]);
    if (!verification.valid) {
      recordScan(db, {
        ticketId: null,
        tripId: params.tripId,
        result: "REFUSE",
        scannedBy: params.scannedBy,
        deviceId: params.deviceId,
        clientTime: params.clientTime,
      });
      return {
        result: "REFUSE" as const,
        motif:
          verification.reason === "FORMAT"
            ? "QR illisible ou étranger à Mobembo."
            : "Signature invalide — ce QR n'a pas été émis par cette compagnie.",
      };
    }

    if (verification.payload.tripId !== params.tripId) {
      return { result: "REFUSE" as const, motif: "Ce billet appartient à un autre voyage." };
    }

    const ticket = db
      .prepare(`SELECT * FROM tickets WHERE id = ?`)
      .get(verification.payload.ticketId) as TicketRow | undefined;
    if (!ticket) return { result: "REFUSE" as const, motif: "Billet inconnu." };

    const seat = db
      .prepare(`SELECT seat_number FROM trip_seats WHERE id = ?`)
      .get(ticket.trip_seat_id) as { seat_number: string };

    // §2.7 : « Un billet annulé pour revente figure au manifeste avec un statut
    // invalide explicite : le contrôleur voit pourquoi le QR est refusé et à
    // qui appartient désormais le siège. »
    if (ticket.status === "ANNULE_REVENDU" || ticket.status === "TRANSFERE") {
      const successor = db
        .prepare(
          `SELECT passenger_name, ticket_code FROM tickets
            WHERE parent_ticket_id = ? AND status IN ('EMIS','EMBARQUE') LIMIT 1`,
        )
        .get(ticket.id) as { passenger_name: string; ticket_code: string } | undefined;
      recordScan(db, {
        ticketId: ticket.id,
        tripId: params.tripId,
        result: "REFUSE",
        scannedBy: params.scannedBy,
        deviceId: params.deviceId,
        clientTime: params.clientTime,
      });
      return {
        result: "REFUSE" as const,
        motif:
          ticket.status === "ANNULE_REVENDU"
            ? `Siège ${seat.seat_number} revendu : ce QR n'est plus valable.`
            : `Billet transféré : ce QR n'est plus valable.`,
        detail: `Ancien titulaire : ${ticket.passenger_name}.`,
        nouveauTitulaire: successor
          ? `${successor.passenger_name} (${successor.ticket_code})`
          : undefined,
      };
    }

    if (["ANNULE", "EXPIRE"].includes(ticket.status)) {
      recordScan(db, {
        ticketId: ticket.id,
        tripId: params.tripId,
        result: "REFUSE",
        scannedBy: params.scannedBy,
        deviceId: params.deviceId,
        clientTime: params.clientTime,
      });
      return {
        result: "REFUSE" as const,
        motif: ticket.status === "ANNULE" ? "Billet annulé." : "Billet expiré.",
      };
    }

    // §2.7 anti-rejeu : « Un second scan affiche un avertissement rouge
    // "DÉJÀ SCANNÉ à HH:MM". »
    const first = db
      .prepare(
        `SELECT scanned_at FROM boarding_scans
          WHERE ticket_id = ? AND result = 'ACCEPTE' ORDER BY scanned_at LIMIT 1`,
      )
      .get(ticket.id) as { scanned_at: string } | undefined;
    if (first) {
      recordScan(db, {
        ticketId: ticket.id,
        tripId: params.tripId,
        result: "DEJA_SCANNE",
        scannedBy: params.scannedBy,
        deviceId: params.deviceId,
        clientTime: params.clientTime,
      });
      return {
        result: "DEJA_SCANNE" as const,
        ticket,
        seat: seat.seat_number,
        premierScanA: first.scanned_at,
      };
    }

    // §2.9 : « Le contrôleur embarque un billet valide jusqu'à la clôture
    // manuelle du manifeste » — l'heure théorique n'interdit rien.
    if (trip.manifest_closed_at) {
      return { result: "REFUSE" as const, motif: "Manifeste clôturé : embarquement terminé." };
    }

    db.prepare(`UPDATE tickets SET status = 'EMBARQUE', updated_at = ? WHERE id = ?`).run(
      nowIso(),
      ticket.id,
    );
    db.prepare(`UPDATE trip_seats SET status = 'EMBARQUE' WHERE id = ?`).run(ticket.trip_seat_id);
    db.prepare(
      `UPDATE resale_listings SET status = 'RETIREE' WHERE ticket_id = ? AND status = 'ACTIVE'`,
    ).run(ticket.id);
    recordScan(db, {
      ticketId: ticket.id,
      tripId: params.tripId,
      result: "ACCEPTE",
      scannedBy: params.scannedBy,
      deviceId: params.deviceId,
      clientTime: params.clientTime,
    });

    return {
      result: "ACCEPTE" as const,
      ticket: getTicket(ticket.id, db),
      seat: seat.seat_number,
      passager: ticket.passenger_name,
    };
  });
}

function recordScan(
  db: Database,
  params: {
    ticketId: string | null;
    tripId: string;
    result: "ACCEPTE" | "DEJA_SCANNE" | "REFUSE";
    scannedBy?: string | null;
    deviceId?: string | null;
    clientTime?: string | null;
  },
): void {
  if (!params.ticketId) return;
  db.prepare(
    `INSERT INTO boarding_scans
       (id, ticket_id, trip_id, scanned_by, scanned_at, device_id, result, synced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    newId("bsc"),
    params.ticketId,
    params.tripId,
    params.scannedBy ?? null,
    // L'heure serveur fait foi ; l'heure du terminal est conservée en note.
    nowIso(),
    params.deviceId ?? null,
    params.result,
    nowIso(),
  );
}

/**
 * §2.7 : « Synchronisation du manifeste scanné au retour du réseau : liste des
 * no-shows, taux de remplissage réel. » Les scans arrivent par lot, chacun
 * idempotent par `clientOpId`.
 */
export function syncScans(params: {
  tripId: string;
  deviceId: string;
  scans: Array<{ clientOpId: string; rawQr: string; clientTime: string }>;
  scannedBy?: string | null;
}): Array<{ clientOpId: string; outcome: ScanOutcome | { result: "DEJA_SYNCHRONISE" } }> {
  const db = getDb();
  const results: Array<{
    clientOpId: string;
    outcome: ScanOutcome | { result: "DEJA_SYNCHRONISE" };
  }> = [];

  for (const scan of params.scans) {
    const seen = db
      .prepare(`SELECT id FROM sync_log WHERE client_op_id = ?`)
      .get(scan.clientOpId) as { id: string } | undefined;
    if (seen) {
      results.push({ clientOpId: scan.clientOpId, outcome: { result: "DEJA_SYNCHRONISE" } });
      continue;
    }

    const outcome = scanTicket({
      tripId: params.tripId,
      rawQr: scan.rawQr,
      scannedBy: params.scannedBy,
      deviceId: params.deviceId,
      clientTime: scan.clientTime,
    });

    db.prepare(
      `INSERT INTO sync_log
         (id, device_id, client_op_id, kind, payload_json, result, client_time, server_time)
       VALUES (?, ?, ?, 'SCAN_EMBARQUEMENT', ?, ?, ?, ?)`,
    ).run(
      newId("syn"),
      params.deviceId,
      scan.clientOpId,
      JSON.stringify({ tripId: params.tripId }),
      outcome.result,
      scan.clientTime,
      nowIso(),
    );
    results.push({ clientOpId: scan.clientOpId, outcome });
  }
  return results;
}

/**
 * §2.9 : « Un billet passe à EXPIRE si et seulement si le trajet est marqué
 * parti et qu'aucun scan n'est enregistré. Le départ effectif fait foi. »
 */
export function markDeparted(params: {
  tripId: string;
  actor: { userId: string; role: string; companyId?: string | null };
}): { departedAt: string } {
  return tx((db) => {
    const trip = getTrip(params.tripId, db);
    if (trip.departed_at) {
      throw errors.conflict("DEPART_DEJA_ENREGISTRE", "Le départ effectif est déjà enregistré.");
    }
    const departedAt = nowIso();
    db.prepare(`UPDATE trips SET status = 'PARTI', departed_at = ? WHERE id = ?`).run(
      departedAt,
      params.tripId,
    );
    audit(
      {
        userId: params.actor.userId,
        role: params.actor.role,
        companyId: params.actor.companyId,
        action: "DEPART_EFFECTIF",
        entity: "trip",
        entityId: params.tripId,
        before: { horaireTheorique: trip.departure_datetime },
        after: { departEffectif: departedAt },
      },
      db,
    );
    return { departedAt };
  });
}

/** Clôture manuelle du manifeste : les no-shows sont alors constatés. */
export function closeManifest(params: {
  tripId: string;
  actor: { userId: string; role: string; companyId?: string | null };
}): { noShows: number; embarques: number; tauxRemplissage: number } {
  return tx((db) => {
    const trip = getTrip(params.tripId, db);
    if (!trip.departed_at) {
      throw errors.conflict(
        "TRAJET_NON_PARTI",
        "Enregistrez d'abord le départ effectif : c'est lui qui fait foi, pas l'horaire.",
      );
    }
    if (trip.manifest_closed_at) {
      throw errors.conflict("MANIFESTE_CLOS", "Ce manifeste est déjà clôturé.");
    }

    db.prepare(`UPDATE trips SET manifest_closed_at = ?, status = 'CLOTURE' WHERE id = ?`).run(
      nowIso(),
      params.tripId,
    );
    const noShows = expireNoShows(params.tripId, db);

    const counts = db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM tickets WHERE trip_id = ? AND status = 'EMBARQUE') AS embarques,
           (SELECT COUNT(*) FROM trip_seats WHERE trip_id = ?) AS sieges`,
      )
      .get(params.tripId, params.tripId) as { embarques: number; sieges: number };

    audit(
      {
        userId: params.actor.userId,
        role: params.actor.role,
        companyId: params.actor.companyId,
        action: "CLOTURE_MANIFESTE",
        entity: "trip",
        entityId: params.tripId,
        after: { noShows, embarques: counts.embarques },
      },
      db,
    );

    return {
      noShows,
      embarques: counts.embarques,
      tauxRemplissage: counts.sieges > 0 ? counts.embarques / counts.sieges : 0,
    };
  });
}

export { formatTime };
