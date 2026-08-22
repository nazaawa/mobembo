import type { Database } from "better-sqlite3";
import { getDb, tx } from "@/lib/db";
import { newId } from "@/lib/core/ids";
import { nowIso, plusDays, hoursUntil, formatDateTime } from "@/lib/core/time";
import { errors } from "@/lib/core/errors";
import type { Currency } from "@/lib/core/money";
import { formatMoney } from "@/lib/core/money";
import { audit } from "./audit";
import { queueSms, flushSmsQueue } from "@/lib/sms";
import {
  companyPolicy,
  getCompany,
  getTicket,
  getTrip,
  type CreditRow,
  type TicketRow,
} from "./repo";
import type { CompanyPolicy } from "./types";

/**
 * §2.9 : « La grille est un gradient d'incitation, pas un barème de sanctions.
 * Chaque option est plus intéressante pour le passager que la suivante, dans
 * l'ordre qui arrange l'exploitation :
 *   transférer > revendre > reporter > annuler tard > ne pas venir »
 */
export type RenunciationAction =
  | "TRANSFERT"
  | "REVENTE"
  | "REPORT"
  | "ANNULATION_TARDIVE"
  | "NO_SHOW";

export interface GridOption {
  action: RenunciationAction;
  label: string;
  delai: string;
  recupere: string;
  forme: string;
  disponible: boolean;
  raison?: string;
  /** Montant récupéré si l'option est exercée maintenant, en centimes. */
  montant: number;
}

/**
 * Grille calculée pour un billet donné à l'instant présent. Le passager voit
 * ce qu'il perd en attendant — c'est tout l'objet du gradient.
 */
export function renunciationGrid(ticketId: string, db: Database = getDb()): GridOption[] {
  const ticket = getTicket(ticketId, db);
  const trip = getTrip(ticket.trip_id, db);
  const company = getCompany(trip.company_id, db);
  const policy = companyPolicy(company);
  const remaining = trip.departed_at ? -1 : hoursUntil(trip.departure_datetime);
  const closed = !["EMIS", "EN_REVENTE"].includes(ticket.status);

  const unavailable = (raison: string) => ({ disponible: false, raison });

  return [
    {
      action: "TRANSFERT" as const,
      label: "Transférer à un proche",
      delai: `jusqu'à ${policy.transferDeadlineHours} h avant`,
      recupere: "100 %",
      forme: "gratuit",
      montant: ticket.price_amount,
      ...(closed
        ? unavailable(`Billet ${ticket.status}.`)
        : remaining < policy.transferDeadlineHours
          ? unavailable(`Départ dans moins de ${policy.transferDeadlineHours} h.`)
          : { disponible: true }),
    },
    {
      action: "REVENTE" as const,
      label: "Remettre en vente",
      delai: `jusqu'à ${policy.resaleDeadlineHours} h avant`,
      recupere: `${Math.round((1 - policy.resaleFeeRate) * 100)} %`,
      forme: "Mobile Money",
      montant: ticket.price_amount - Math.ceil(ticket.price_amount * policy.resaleFeeRate),
      ...(closed
        ? unavailable(`Billet ${ticket.status}.`)
        : remaining < policy.resaleDeadlineHours
          ? unavailable(`Départ dans moins de ${policy.resaleDeadlineHours} h.`)
          : { disponible: true }),
    },
    {
      action: "REPORT" as const,
      label: "Reporter la date",
      delai: `jusqu'à ${policy.postponeDeadlineHours} h avant`,
      recupere: "100 %",
      forme: `avoir, ${policy.postponeCreditDays} jours`,
      montant: ticket.price_amount,
      ...(closed
        ? unavailable(`Billet ${ticket.status}.`)
        : remaining < policy.postponeDeadlineHours
          ? unavailable(`Départ dans moins de ${policy.postponeDeadlineHours} h.`)
          : { disponible: true }),
    },
    {
      action: "ANNULATION_TARDIVE" as const,
      label: "Annuler tardivement",
      delai: `${policy.postponeDeadlineHours} h avant → départ`,
      recupere: `${Math.round(policy.lateCancelRate * 100)} %`,
      forme: `avoir, ${policy.lateCancelCreditDays} jours`,
      montant: Math.floor(ticket.price_amount * policy.lateCancelRate),
      ...(closed
        ? unavailable(`Billet ${ticket.status}.`)
        : remaining < 0
          ? unavailable("Le bus est parti.")
          : remaining >= policy.postponeDeadlineHours
            ? unavailable("Le report à 100 % reste ouvert : préférez-le.")
            : { disponible: true }),
    },
    {
      action: "NO_SHOW" as const,
      label: "Ne pas venir",
      delai: "après départ effectif",
      recupere: "0 %",
      forme: "—",
      montant: 0,
      disponible: false,
      raison: "Aucune action : le billet expire au départ du bus.",
    },
  ];
}

/**
 * §2.9 : « L'avoir plutôt que l'espèce. Un remboursement en avoir ne coûte
 * aucune trésorerie à la compagnie, aucun frais de décaissement à la
 * plateforme, et conserve le client. »
 */
export function issueCredit(
  db: Database,
  params: {
    phone: string;
    companyId: string;
    amount: number;
    currency: Currency;
    originTicketId: string | null;
    validityDays: number;
  },
): CreditRow {
  const id = newId("crd");
  db.prepare(
    `INSERT INTO credits
       (id, passenger_phone, company_id, amount, currency, origin_ticket_id,
        issued_at, expires_at, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIF', ?)`,
  ).run(
    id,
    params.phone,
    params.companyId,
    params.amount,
    params.currency,
    params.originTicketId,
    nowIso(),
    plusDays(params.validityDays),
    nowIso(),
  );
  return db.prepare(`SELECT * FROM credits WHERE id = ?`).get(id) as CreditRow;
}

export function activeCredits(
  phone: string,
  companyId?: string,
  db: Database = getDb(),
): CreditRow[] {
  db.prepare(`UPDATE credits SET status = 'EXPIRE' WHERE status = 'ACTIF' AND expires_at <= ?`).run(
    nowIso(),
  );
  const sql = companyId
    ? `SELECT * FROM credits WHERE passenger_phone = ? AND status = 'ACTIF' AND company_id = ? ORDER BY expires_at`
    : `SELECT * FROM credits WHERE passenger_phone = ? AND status = 'ACTIF' ORDER BY expires_at`;
  return (companyId
    ? db.prepare(sql).all(phone, companyId)
    : db.prepare(sql).all(phone)) as CreditRow[];
}

/**
 * Renoncement du passager par avoir : report de date (100 %) ou annulation
 * tardive (50 %). Le billet est clos, le siège retourne au stock — à la
 * différence de la revente, où il reste VENDU.
 */
export function renounceForCredit(params: {
  ticketId: string;
  actorPhone: string;
  action: "REPORT" | "ANNULATION_TARDIVE";
}): { ticket: TicketRow; credit: CreditRow } {
  const outcome = tx((db) => {
    const ticket = getTicket(params.ticketId, db);
    if (ticket.passenger_phone !== params.actorPhone) {
      throw errors.forbidden("Ce billet n'est pas au nom de ce numéro.");
    }
    const grid = renunciationGrid(params.ticketId, db);
    const option = grid.find((o) => o.action === params.action);
    if (!option?.disponible) {
      throw errors.conflict("OPTION_INDISPONIBLE", option?.raison ?? "Option indisponible.");
    }

    const trip = getTrip(ticket.trip_id, db);
    const company = getCompany(trip.company_id, db);
    const policy = companyPolicy(company);

    db.prepare(
      `UPDATE resale_listings SET status = 'RETIREE' WHERE ticket_id = ? AND status = 'ACTIVE'`,
    ).run(ticket.id);
    db.prepare(`UPDATE tickets SET status = 'ANNULE', updated_at = ? WHERE id = ?`).run(
      nowIso(),
      ticket.id,
    );
    db.prepare(
      `UPDATE trip_seats SET status = 'DISPONIBLE', locked_until = NULL,
              lock_session_id = NULL, lock_phone = NULL WHERE id = ?`,
    ).run(ticket.trip_seat_id);

    const credit = issueCredit(db, {
      phone: ticket.passenger_phone,
      companyId: trip.company_id,
      amount: option.montant,
      currency: ticket.price_currency as Currency,
      originTicketId: ticket.id,
      validityDays:
        params.action === "REPORT" ? policy.postponeCreditDays : policy.lateCancelCreditDays,
    });

    queueSms(
      db,
      ticket.passenger_phone,
      `MOBEMBO : billet ${ticket.ticket_code} (${formatDateTime(trip.departure_datetime)}) annule. ` +
        `Avoir de ${formatMoney(credit.amount, credit.currency as Currency)} valable jusqu'au ` +
        `${formatDateTime(credit.expires_at)} chez ${company.name}.`,
      "AVOIR",
    );

    audit(
      {
        companyId: trip.company_id,
        action: params.action === "REPORT" ? "REPORT_DATE" : "ANNULATION_TARDIVE",
        entity: "ticket",
        entityId: ticket.id,
        before: { status: ticket.status },
        after: { status: "ANNULE", avoir: credit.id, montant: credit.amount },
      },
      db,
    );

    return { ticket: getTicket(ticket.id, db), credit };
  });
  void flushSmsQueue();
  return outcome;
}

/**
 * §2.10 Grille de responsabilité — remboursement passager et imputation.
 * La plateforme rembourse « quel que soit le responsable, sous SLA de 48 h.
 * Elle récupère ensuite. »
 */
export type LiabilitySituation =
  | "TRAJET_ANNULE"
  | "RETARD_PLUS_3H"
  | "SIEGE_NON_HONORE"
  | "DOUBLE_DEBIT"
  | "ANNULATION_PASSAGER";

export interface LiabilityRule {
  situation: LiabilitySituation;
  label: string;
  remboursementRate: number;
  avoirRate: number;
  impute: "COMPAGNIE" | "COMPAGNIE_PENALITE" | "PLATEFORME" | "PASSAGER";
}

export const LIABILITY_GRID: LiabilityRule[] = [
  {
    situation: "TRAJET_ANNULE",
    label: "Trajet annulé, bus en panne",
    remboursementRate: 1,
    avoirRate: 0.25,
    impute: "COMPAGNIE",
  },
  {
    situation: "RETARD_PLUS_3H",
    label: "Départ retardé de plus de 3 h, passager renonce",
    remboursementRate: 1,
    avoirRate: 0,
    impute: "COMPAGNIE",
  },
  {
    // « La ligne en gras est la plus importante du document. » Une pénalité au
    // double du prix rend la vente hors système économiquement absurde.
    situation: "SIEGE_NON_HONORE",
    label: "Siège non honoré, vendu deux fois",
    remboursementRate: 1,
    avoirRate: 1,
    impute: "COMPAGNIE_PENALITE",
  },
  {
    situation: "DOUBLE_DEBIT",
    label: "Échec de paiement, double débit",
    remboursementRate: 1,
    avoirRate: 0,
    impute: "PLATEFORME",
  },
  {
    situation: "ANNULATION_PASSAGER",
    label: "Annulation à l'initiative du passager",
    remboursementRate: 0,
    avoirRate: 0,
    impute: "PASSAGER",
  },
];

/** Applique la grille de responsabilité à un billet : remboursement + avoir. */
export function applyLiability(params: {
  ticketId: string;
  situation: LiabilitySituation;
  actor: { userId: string; role: string; companyId?: string | null };
  note?: string;
}): { remboursement: number; avoir: number; impute: string } {
  const rule = LIABILITY_GRID.find((r) => r.situation === params.situation);
  if (!rule) throw errors.invalid("Situation inconnue dans la grille de responsabilité.");

  const outcome = tx((db) => {
    const ticket = getTicket(params.ticketId, db);
    const trip = getTrip(ticket.trip_id, db);
    const company = getCompany(trip.company_id, db);
    const policy: CompanyPolicy = companyPolicy(company);
    const currency = ticket.price_currency as Currency;

    const refundAmount = Math.round(ticket.price_amount * rule.remboursementRate);
    const creditAmount = Math.round(ticket.price_amount * rule.avoirRate);

    if (refundAmount > 0) {
      const originalPayment = db
        .prepare(
          `SELECT provider, payer_phone FROM payments
            WHERE booking_id = ? AND status = 'CONFIRME' ORDER BY created_at LIMIT 1`,
        )
        .get(ticket.booking_id) as { provider: string; payer_phone: string } | undefined;

      db.prepare(
        `INSERT INTO refunds
           (id, ticket_id, booking_id, amount, currency, target_phone, provider, reason, liable, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'EN_FILE', ?)`,
      ).run(
        newId("rfd"),
        ticket.id,
        ticket.booking_id,
        refundAmount,
        currency,
        originalPayment?.payer_phone ?? ticket.passenger_phone,
        originalPayment?.provider ?? "MPESA",
        `${rule.label}${params.note ? ` — ${params.note}` : ""}`,
        rule.impute,
        nowIso(),
      );
    }

    if (creditAmount > 0) {
      issueCredit(db, {
        phone: ticket.passenger_phone,
        companyId: trip.company_id,
        amount: creditAmount,
        currency,
        originTicketId: ticket.id,
        validityDays: policy.postponeCreditDays,
      });
    }

    if (ticket.status !== "EMBARQUE") {
      db.prepare(`UPDATE tickets SET status = 'ANNULE', updated_at = ? WHERE id = ?`).run(
        nowIso(),
        ticket.id,
      );
    }

    queueSms(
      db,
      ticket.passenger_phone,
      `MOBEMBO : ${rule.label}. Remboursement de ${formatMoney(refundAmount, currency)} sous 48 h` +
        (creditAmount > 0 ? `, plus un avoir de ${formatMoney(creditAmount, currency)}.` : "."),
      "REMBOURSEMENT",
    );

    audit(
      {
        userId: params.actor.userId,
        role: params.actor.role,
        companyId: trip.company_id,
        action: "GRILLE_RESPONSABILITE",
        entity: "ticket",
        entityId: ticket.id,
        after: {
          situation: params.situation,
          remboursement: refundAmount,
          avoir: creditAmount,
          impute: rule.impute,
          note: params.note,
        },
      },
      db,
    );

    return { remboursement: refundAmount, avoir: creditAmount, impute: rule.impute };
  });
  void flushSmsQueue();
  return outcome;
}
