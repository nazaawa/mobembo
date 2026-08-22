/**
 * §2.7 / §3.1 — le contrôleur valide le QR hors-ligne, dans son navigateur.
 *
 * Deux implémentations coexistent : `src/lib/domain/qr.ts` (node:crypto, côté
 * serveur, qui signe) et `src/lib/client/qr-verify.ts` (Web Crypto, côté
 * terminal, qui vérifie). Si elles divergent d'un octet, tous les billets déjà
 * émis deviennent inscannables hors connexion. Ce test les compare.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";

// Le module client s'attend à `crypto.subtle` et `btoa`, présents dans un
// navigateur ; Node les expose sous un autre nom.
globalThis.crypto ??= webcrypto as Crypto;

import { buildQr, verifyQr } from "@/lib/domain/qr";
import { verifierQrLocalement, lireQr } from "@/lib/client/qr-verify";

const SECRET = "cle-hmac-de-la-compagnie-pilote";
const PAYLOAD = { ticketId: "tkt_abcdef0123456789", tripId: "trp_9876543210fedcba", seat: "12C" };

test("le QR signé par le serveur est validé par le terminal contrôleur", async () => {
  const qr = buildQr(PAYLOAD, SECRET);

  const cote0Serveur = verifyQr(qr, [SECRET]);
  assert.equal(cote0Serveur.valid, true);

  const coteTerminal = await verifierQrLocalement(qr, [SECRET]);
  assert.equal(coteTerminal.valide, true);
  assert.deepEqual(coteTerminal.valide && coteTerminal.payload, PAYLOAD);
});

test("le terminal refuse une signature falsifiée", async () => {
  const qr = buildQr(PAYLOAD, SECRET);
  const falsifie = qr.replace(/\|[^|]+$/, "|AAAAAAAAAAAAAAAAAAAAAA");

  assert.equal((await verifierQrLocalement(falsifie, [SECRET])).valide, false);
  // Le payload reste lisible : le contrôleur peut nommer le siège refusé.
  assert.deepEqual(lireQr(falsifie), PAYLOAD);
});

test("le terminal refuse la clé d'une autre compagnie", async () => {
  const qr = buildQr(PAYLOAD, SECRET);
  const verdict = await verifierQrLocalement(qr, ["cle-d-une-autre-compagnie"]);
  assert.equal(verdict.valide, false);
  assert.equal(verdict.valide === false && verdict.raison, "SIGNATURE");
});

test("la rotation de clé laisse les billets déjà émis scannables", async () => {
  const ancienne = "ancienne-cle-avant-rotation";
  const nouvelle = "nouvelle-cle-apres-rotation";
  const qrAncien = buildQr(PAYLOAD, ancienne);

  // Le manifeste embarque la clé courante puis la précédente : un billet émis
  // avant la rotation reste valable jusqu'à son départ.
  assert.equal(verifyQr(qrAncien, [nouvelle, ancienne]).valid, true);
  assert.equal((await verifierQrLocalement(qrAncien, [nouvelle, ancienne])).valide, true);
  assert.equal(verifyQr(qrAncien, [nouvelle]).valid, false);
});

test("un QR d'un autre système est rejeté sur le format, pas sur la signature", async () => {
  const verdict = await verifierQrLocalement("https://exemple.cd/billet/123", [SECRET]);
  assert.equal(verdict.valide, false);
  assert.equal(verdict.valide === false && verdict.raison, "FORMAT");
  assert.equal(lireQr("https://exemple.cd/billet/123"), null);
});
