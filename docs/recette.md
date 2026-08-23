# Cahier de recette

> « Chaque cas de test porte un résultat attendu explicite. Un test sans
> résultat attendu écrit n'est pas un test. » (§5.2)

```bash
npm test
```

**40 cas, tous automatisés.** Chaque test repart d'une base vide : aucun état
n'est partagé, l'ordre d'exécution n'a pas d'importance.

Les tests s'exécutent obligatoirement sur une base **en mémoire**
(`MOBEMBO_DB_PATH=:memory:`, posé par le script npm). `seedFixture()` refuse de
démarrer sur toute autre cible : `resetDb()` vide toutes les tables, et se
tromper de base coûterait les données réelles. Lancez-les toujours par
`npm test`, jamais par `tsx --test` directement.

---

## Scénarios critiques obligatoires (§5.2)

| # | Scénario | Résultat attendu | Test |
| - | -------- | ---------------- | ---- |
| 1 | Deux guichetiers sélectionnent le même siège au même instant | Un seul billet émis ; le second reçoit `SIEGE_INDISPONIBLE` | `§5.2.1` |
| 2 | Coupure réseau en pleine vente guichet | La vente aboutit dans la limite du quota local, puis se synchronise sans doublon | `§5.2.2` |
| 3 | Deux acheteurs sur le même siège remis en vente | Un seul paiement accepté, l'autre reçoit `ANNONCE_INDISPONIBLE` | `§5.2.3` |
| 4 | Double clic sur le paiement | Un seul débit ; la seconde initiation est reconnue comme rejeu | `§5.2.4` |
| 5 | Webhook jamais reçu | Bascule sur polling, puis `INDETERMINE`, siège **toujours verrouillé**, ticket support créé | `§5.2.5` |
| 6 | Ancien QR d'un billet revendu présenté à l'embarquement | Refus explicite, avec le nom du nouveau titulaire | `§5.2.6` |
| 7 | Même QR scanné deux fois | `DEJA_SCANNE` avec l'heure du premier scan | `§5.2.7` |
| 8 | Fermeture de caisse avec écart | Écart exact ; session non rejouable ni modifiable ; alerte au-delà du seuil | `§5.2.8` |

---

## Règles commerciales vérifiées (§2.6, §2.9, §2.10)

**Revente**

- Commission de 10 % avec plancher de 1 USD, converti dans la devise du billet.
- Le siège reste `VENDU` pendant toute la revente — jamais de retour au stock.
- Le prix est celui de l'achat original : aucune fixation libre.
- Un billet ne se revend qu'une seule fois ; le billet racheté redevient éligible.
- Le remboursement part vers le numéro du **paiement initial**, jamais vers un
  numéro saisi au moment de la revente.
- Garde-fou : 3 reventes par numéro et par mois.
- Sans acheteur avant la limite, le billet redevient `EMIS` — son titulaire n'a
  rien perdu.
- La revente ferme 4 h avant le départ.

**Transfert**

- Gratuit : aucune ligne de remboursement n'est créée.
- Le prix suit le billet.
- Ferme 1 h avant le départ.

**Gradient d'incitation (§2.9)**

- L'ordre `transférer ≥ revendre > reporter > annuler tard > ne pas venir` est
  vérifié sur les montants calculés, pas seulement sur les libellés.
- Annulation tardive : 50 % en avoir de 30 jours, siège rendu au stock.
- Report : 100 % en avoir de 60 jours.
- No-show : `EXPIRE` **seulement** si le départ effectif est enregistré.
- Un passager en retard embarque tant que le manifeste est ouvert.

**Reversement (§2.10)**

- Pénalité au double du prix pour un siège vendu deux fois.
- `net = ventes − commission − remboursements − pénalités − abonnement − réserve`.
- Les ventes guichet ne portent aucune commission.

**Exploitation**

- Un départ au remplissage n'apparaît jamais dans la recherche en ligne.
- Le rééquilibrage déplace le quota et se journalise.
- Numérotation séquentielle par agence ; un trou déclenche une alerte.
- Le guichetier ne peut pas annuler ; le gérant doit motiver, et le motif est
  journalisé.
- 3 verrous maximum par numéro.
- Un verrou expiré rend le siège à **son** canal d'origine.

**QR hors-ligne**

- Le QR signé par le serveur est validé par le terminal contrôleur.
- Une signature falsifiée est refusée, mais le payload reste lisible pour
  nommer le siège refusé.
- La clé d'une autre compagnie ne valide pas.
- Après rotation de clé, les billets déjà émis restent scannables.

---

## Classification des anomalies (§5.2)

| Gravité | Définition | Effet sur la recette |
| ------- | ---------- | -------------------- |
| **Bloquante** | Perte d'argent, double vente, billet non émis après paiement, écart de caisse faux | Recette refusée |
| **Majeure** | Fonction du périmètre inutilisable, contournement possible | Recette sous réserve, correction sous 5 jours |
| **Mineure** | Confort, libellé, ergonomie | Recette prononcée, correction planifiée |

---

## Recette manuelle complémentaire

Les tests automatisés ne couvrent pas ce qui se juge à l'usage. À dérouler sur
l'environnement de recette, avec le gérant d'agence et la direction :

1. **Charge réelle du guichet** — une file de dix passagers, chronométrée. §3.4
   exige que le POS suive le rythme d'un guichetier expérimenté.
2. **Coupure réseau physique** — couper le Wi-Fi en pleine vente, vendre cinq
   billets hors-ligne, rétablir, vérifier la synchronisation.
3. **Embarquement complet** — un bus réel, du premier scan à la clôture du
   manifeste.
4. **Lisibilité en plein soleil** — l'écran de verdict du contrôleur se lit à
   bout de bras, dehors, à midi.
5. **Test de restauration de sauvegarde.** §3.3 : « un test de restauration non
   exécuté vaut zéro sauvegarde ».

La recette est prononcée par **le gérant d'agence et la direction de la
compagnie**, pas par l'équipe de développement (§5.2).
