import { randomBytes, scryptSync, timingSafeEqual, createHash } from "node:crypto";

/**
 * §3.3 : « Comptes staff par mot de passe haché ; passagers sans mot de passe,
 * authentification par OTP SMS. »
 *
 * scrypt de la bibliothèque standard : pas de dépendance native supplémentaire
 * à compiler sur une machine d'agence, et un coût mémoire qui rend une attaque
 * par dictionnaire hors de portée d'un poste volé.
 */
const KEYLEN = 64;
const COST = 16384;

export function hashPassword(plain: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(plain, salt, KEYLEN, { N: COST });
  return `scrypt$${COST}$${salt.toString("base64")}$${derived.toString("base64")}`;
}

export function verifyPassword(plain: string, stored: string | null): boolean {
  if (!stored) return false;
  const [scheme, cost, salt, digest] = stored.split("$");
  if (scheme !== "scrypt") return false;
  const expected = Buffer.from(digest, "base64");
  const actual = scryptSync(plain, Buffer.from(salt, "base64"), expected.length, {
    N: Number(cost),
  });
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Le code OTP n'est jamais stocké en clair, même avec 5 minutes de validité. */
export function hashOtp(code: string, phone: string): string {
  return createHash("sha256").update(`${phone}:${code}`).digest("hex");
}
