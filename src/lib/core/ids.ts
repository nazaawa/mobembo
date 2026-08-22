import { randomBytes, randomInt } from "node:crypto";

/** Identifiant interne : préfixe lisible + 16 hex. */
export function newId(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString("hex")}`;
}

const CODE_ALPHABET = "ACDEFGHJKLMNPQRSTUVWXY3456789"; // sans 0/O/1/I/B/8 ambigus

/**
 * Code billet dicté au téléphone et retapé à la main : 8 caractères sans
 * couple ambigu. Il n'est pas secret — le QR signé porte la preuve (§3.1).
 */
export function newTicketCode(): string {
  let out = "";
  for (let i = 0; i < 8; i++) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return `${out.slice(0, 4)}-${out.slice(4)}`;
}

export function newOtp(): string {
  return String(randomInt(100000, 1000000));
}
