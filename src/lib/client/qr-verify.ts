"use client";

/**
 * §2.7 : « Scan QR hors-ligne : validation par vérification locale de
 * signature. Aucun appel réseau nécessaire. »
 *
 * Miroir exact de `src/lib/domain/qr.ts`, écrit sur Web Crypto pour tourner
 * dans le navigateur du terminal contrôleur. La clé HMAC de la compagnie
 * arrive avec le manifeste ; elle ne sort pas du terminal.
 *
 * Les deux implémentations doivent rester alignées : tout changement de format
 * casse la vérification hors-ligne des billets déjà émis. Le test
 * `tests/qr-navigateur.test.ts` vérifie qu'elles produisent la même signature.
 */
const VERSION = "MBO1";

export interface QrPayload {
  ticketId: string;
  tripId: string;
  seat: string;
}

function base64url(bytes: ArrayBuffer): string {
  const binaire = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(binaire).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function signer(body: string, secret: string): Promise<string> {
  const encodeur = new TextEncoder();
  const cle = await crypto.subtle.importKey(
    "raw",
    encodeur.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", cle, encodeur.encode(body));
  return base64url(signature).slice(0, 22);
}

export type VerificationLocale =
  | { valide: true; payload: QrPayload }
  | { valide: false; raison: "FORMAT" | "SIGNATURE" };

export async function verifierQrLocalement(
  brut: string,
  secrets: (string | null | undefined)[],
): Promise<VerificationLocale> {
  const parts = brut.trim().split("|");
  if (parts.length !== 5 || parts[0] !== VERSION) return { valide: false, raison: "FORMAT" };
  const [, ticketId, tripId, seat, signature] = parts;
  const body = parts.slice(0, 4).join("|");

  for (const secret of secrets) {
    if (!secret) continue;
    if ((await signer(body, secret)) === signature) {
      return { valide: true, payload: { ticketId, tripId, seat } };
    }
  }
  return { valide: false, raison: "SIGNATURE" };
}

/** Lecture sans validation, pour afficher un refus circonstancié. */
export function lireQr(brut: string): QrPayload | null {
  const parts = brut.trim().split("|");
  if (parts.length !== 5 || parts[0] !== VERSION) return null;
  return { ticketId: parts[1], tripId: parts[2], seat: parts[3] };
}
