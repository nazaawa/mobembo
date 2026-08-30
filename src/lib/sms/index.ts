import type { DbHandle } from "@/lib/db";
import { getDb } from "@/lib/db";
import { newId } from "@/lib/core/ids";
import { nowIso } from "@/lib/core/time";

/**
 * §3.1 : « Passerelle SMS avec basculement sur un second fournisseur. »
 * §2.5 : « Le SMS est obligatoire, pas optionnel. C'est le seul canal qui
 * survit à un téléphone déchargé, réinstallé ou changé. »
 *
 * L'implémentation de développement journalise en base ; les fournisseurs
 * réels s'enfichent derrière la même interface, avec bascule sur échec.
 */
export interface SmsProvider {
  readonly id: string;
  send(phone: string, body: string): Promise<{ ok: boolean; ref?: string }>;
}

class LoggingProvider implements SmsProvider {
  constructor(readonly id: string) {}
  async send(): Promise<{ ok: boolean; ref?: string }> {
    return { ok: true, ref: newId("sms") };
  }
}

let primary: SmsProvider = new LoggingProvider("PRIMAIRE_LOG");
let secondary: SmsProvider = new LoggingProvider("SECOURS_LOG");

export function configureSmsProviders(a: SmsProvider, b: SmsProvider): void {
  primary = a;
  secondary = b;
}

export type SmsKind =
  | "OTP"
  | "BILLET_EMIS"
  | "REVENTE_VENDUE"
  | "REVENTE_ACHETEE"
  | "TRANSFERT"
  | "ANNULATION"
  | "REMBOURSEMENT"
  | "AVOIR"
  // Phase 2 : la réservation légère n'émet pas de billet, le SMS est donc la
  // seule trace que le voyageur emporte au point d'embarquement.
  | "RESERVATION"
  | "RESERVATION_ANNULEE";

export async function sendSms(
  phone: string,
  body: string,
  kind: SmsKind,
  db: DbHandle = getDb(),
): Promise<void> {
  let provider = primary;
  let failover = 0;
  let result = await provider.send(phone, body).catch(() => ({ ok: false }));
  if (!result.ok) {
    provider = secondary;
    failover = 1;
    result = await provider.send(phone, body).catch(() => ({ ok: false }));
  }
  await db
    .prepare(
      `INSERT INTO sms_outbox (id, phone, body, kind, provider, status, failover, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      newId("sms"),
      phone,
      body,
      kind,
      provider.id,
      result.ok ? "ENVOYE" : "ECHOUE",
      failover,
      nowIso(),
    );
}

/**
 * Variante utilisée à l'intérieur des transactions : le SMS est enregistré
 * dans la même transaction que le billet, puis dépilé par `flushSmsQueue`. Un
 * billet émis sans trace d'envoi serait un billet dont le passager n'a rien
 * reçu.
 */
export async function queueSms(
  db: DbHandle,
  phone: string,
  body: string,
  kind: SmsKind,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO sms_outbox (id, phone, body, kind, provider, status, failover, created_at)
     VALUES (?, ?, ?, ?, 'FILE', 'EN_FILE', 0, ?)`,
    )
    .run(newId("sms"), phone, body, kind, nowIso());
}

/** Dépile les SMS mis en file par les transactions métier. */
export async function flushSmsQueue(db: DbHandle = getDb()): Promise<number> {
  const pending = await db
    .prepare<{ id: string; phone: string; body: string }>(
      `SELECT * FROM sms_outbox WHERE status = 'EN_FILE' ORDER BY created_at LIMIT 100`,
    )
    .all();
  for (const message of pending) {
    let provider = primary;
    let failover = 0;
    let result = await provider.send(message.phone, message.body).catch(() => ({ ok: false }));
    if (!result.ok) {
      provider = secondary;
      failover = 1;
      result = await provider.send(message.phone, message.body).catch(() => ({ ok: false }));
    }
    await db
      .prepare(`UPDATE sms_outbox SET status = ?, provider = ?, failover = ? WHERE id = ?`)
      .run(result.ok ? "ENVOYE" : "ECHOUE", provider.id, failover, message.id);
  }
  return pending.length;
}
