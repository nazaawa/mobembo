import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * §3.1 : « QR signé côté serveur (HMAC), vérifiable hors-ligne par l'app
 * contrôleur avec la clé de la compagnie ; rotation de clé prévue. »
 *
 * Le QR ne contient aucun secret : il porte un payload lisible et sa signature.
 * L'app contrôleur détient la clé de sa compagnie, téléchargée avec le
 * manifeste, et valide sans le moindre appel réseau (§2.7).
 *
 * Format : MBO1|ticketId|tripId|seat|HMAC-base64url tronqué à 16 octets.
 */
const VERSION = "MBO1";

export interface QrPayload {
  ticketId: string;
  tripId: string;
  seat: string;
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret)
    .update(payload)
    .digest("base64url")
    .slice(0, 22);
}

export function buildQr(payload: QrPayload, secret: string): string {
  const body = `${VERSION}|${payload.ticketId}|${payload.tripId}|${payload.seat}`;
  return `${body}|${sign(body, secret)}`;
}

export type QrVerification =
  | { valid: true; payload: QrPayload; keyUsed: "courante" | "precedente" }
  | { valid: false; reason: "FORMAT" | "SIGNATURE" };

/**
 * `secrets` accepte la clé courante puis, pendant une rotation, la précédente :
 * un billet émis avant la rotation reste scannable jusqu'à son départ.
 */
export function verifyQr(raw: string, secrets: (string | null | undefined)[]): QrVerification {
  const parts = raw.trim().split("|");
  if (parts.length !== 5 || parts[0] !== VERSION) return { valid: false, reason: "FORMAT" };
  const [, ticketId, tripId, seat, signature] = parts;
  const body = parts.slice(0, 4).join("|");

  const usable = secrets.filter((s): s is string => Boolean(s));
  for (let i = 0; i < usable.length; i++) {
    const expected = sign(body, usable[i]);
    if (expected.length !== signature.length) continue;
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
      return {
        valid: true,
        payload: { ticketId, tripId, seat },
        keyUsed: i === 0 ? "courante" : "precedente",
      };
    }
  }
  return { valid: false, reason: "SIGNATURE" };
}

/** Lecture du payload sans validation — pour afficher un refus circonstancié. */
export function peekQr(raw: string): QrPayload | null {
  const parts = raw.trim().split("|");
  if (parts.length !== 5 || parts[0] !== VERSION) return null;
  return { ticketId: parts[1], tripId: parts[2], seat: parts[3] };
}
