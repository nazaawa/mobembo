# Spécification technique

Correspondance entre le cahier des charges v1.0 et l'implémentation.

---

## 0. Phases 1 et 2 — offre légère (note fonctionnelle mobile)

Le cahier des charges v1.0 décrit la billetterie complète. La note
fonctionnelle mobile la précède de deux phases, dont le principe est qu'une
agence n'a **rien** à changer pour être utile aux voyageurs. Ces deux phases
vivent dans des tables distinctes, à côté du modèle complet, jamais dedans :

| Note fonctionnelle | Implémentation |
| ------------------ | -------------- |
| §4.1-4.3 Accueil, recherche, résultats | `domain/offers.ts` — `searchOffers`, `coveredAxes` |
| §4.4 Fiche agence | `domain/directory.ts` ; `/agences`, `/agences/[slug]` |
| §4.5 Fiche trajet, appel, WhatsApp, itinéraire | `/horaire/[scheduleId]` ; `core/links.ts` |
| §5.1-5.3 Compte et profil agence | `domain/directory.ts` — `updateCompanyProfile` ; `/backoffice/vitrine` |
| §5.4 Gestion des trajets | `domain/schedules.ts` — `createSchedule`, `updateSchedule` |
| §5.5 Mise à jour simple | `domain/schedules.ts` — `quickUpdateSchedule` ; édition en ligne du tableau |
| §6 Date de dernière mise à jour | `schedules.updated_at`, `companies.profile_updated_at`, `<MiseAJour>` |
| §6 Désactivation d'une information | `setScheduleStatus`, `setCompanyListed` |
| §7 Indicateurs | `search_events`, `domain/offers.ts` — `platformCoverage` ; `/administration` |
| §10.1-10.2 Disponibilité et réservation | `domain/reservations.ts` — `createReservation` |
| §10.4 Mes réservations | `passengerReservations` ; `/mes-reservations` |
| §11.1 Mise à disposition de places | `schedules.booking_enabled`, `schedules.online_quota` |
| §11.2 Suivi des réservations | `companyReservations` ; `/backoffice/reservations` |
| §12 Quota, retrait automatique | verrou `FOR UPDATE` sur `schedules` dans `createReservation` |
| §14.1 Paiement d'une réservation | `domain/reservation-payments.ts` — `paymentQuote`, `initiateReservationPayment` ; `/paiement/[reservationId]` |
| §14.2-14.3 Confirmation et billet numérique | `settleReservationPayment` ; `buildReservationQr` (format `MBO2`, sans siège) ; `/billet-reservation/[ticketId]` |
| §14.4 Mes billets (à venir / utilisés / annulés / expirés) | `passengerTickets`, `expirePastTickets` ; `/mes-billets` |
| §14.5 Partage du billet | `navigator.share`, copie, impression thermique |
| §15 Vue agence des billets | `ticketingSummary`, `companyTickets` ; `/backoffice/billets` |
| §16 Règles du billet | billet émis dans la transaction du paiement CONFIRME, unicité `schedule_tickets.reservation_id` |
| §17 Commission 10 % | `companies.online_commission_rate`, figée dans `schedule_payments.commission_amount` |
| §29 Fonctions affichées selon la phase activée | `domain/modules.ts`, `domain/access.ts` ; navigation de `app/backoffice/layout.tsx` |
| §33 Validation entre les phases | ouverture manuelle par le `SUPER_ADMIN` dans `/administration`, tracée `MODULES_AGENCE` |

**Ce que la phase 2 ne fait pas** : aucun paiement, aucun siège numéroté, aucun
billet, aucun QR. Une réservation est une place tenue sur un quota, réglée à
l'agence. Cette limite est dite explicitement à chaque écran, parce qu'un
voyageur qui croit avoir payé se présente sans argent au départ.

**Frontière entre les deux modèles.** `searchOffers` est le seul endroit qui
les réunit. En aval, `bookingMode` (`SIEGE` | `PLACES` | `CONTACT`) porte
l'information : aucune interface ne teste `kind` pour décider quoi proposer.

**Deux formats de QR, volontairement distincts.** `MBO1|ticketId|tripId|seat`
porte un billet à siège (phases 4+) ; `MBO2|ticketId|scheduleId|date` porte un
billet de réservation (phase 3). Un contrôleur qui scanne sait donc de quoi il
s'agit avant de vérifier la signature, au lieu de le deviner — et le
vérificateur de l'un rejette l'autre sur le format, jamais sur la signature.

**Ce que la phase 3 ne change pas.** Un paiement échoué ne fait perdre ni la
place ni la réservation : la phase 2 continue, le voyageur règle à l'agence.
C'est la différence de fond avec la billetterie à sièges, où l'échec libère le
siège verrouillé. §16 impose seulement qu'aucun billet valide n'existe sans
paiement confirmé.

**Remboursements.** §16 les renvoie à des règles « définies par l'agence et
Mobembo » qui n'existent pas encore : le système n'en invente aucune. Annuler un
billet payé l'invalide, met le paiement en `A_REMBOURSER` et le fait remonter à
l'agence, qui rembourse par son canal puis le déclare. Une file d'attente
visible vaut mieux qu'un décaissement automatique sur une règle non écrite.

**Phases ouvertes par agence.** `companies.modules` porte ce que Mobembo a
ouvert ; `companies.advanced_view` porte ce que le directeur affiche parmi
cela. `companyAccess()` combine les deux en `visible`, seule valeur que consulte
la navigation. `requireModule()` protège les écrans concernés — c'est une garde
contre l'égarement, pas une frontière d'autorisation : celle-ci reste portée par
les rôles (§3.3), et un module fermé n'expose donc jamais la donnée d'une autre
agence. Fermer un module ne détruit rien : les réservations, billets et ventes
déjà pris restent valides et lisibles par leurs autres chemins.

---

## 1. Principe directeur (§1.2)

> La base de données est la seule source de vérité sur l'état d'un siège.

Concrètement : **`trip_seats` est la table pivot**. Un siège porte un statut
(`DISPONIBLE`, `VERROUILLE`, `VENDU`, `EMBARQUE`, `ANNULE`, `BLOQUE_ADMIN`) et
un canal propriétaire. Aucun chemin de code ne crée un billet sans passer par
une transaction qui relit ce siège sous verrou d'écriture.

`src/lib/db/index.ts` expose `tx()`, qui ouvre une transaction **`IMMEDIATE`** :
le verrou est pris dès le `BEGIN`, pas au premier write. Sans cela, deux
lecteurs concurrents peuvent tous deux lire « siège disponible » avant qu'un
seul n'obtienne le droit d'écrire — et l'autre échoue en `SQLITE_BUSY` au lieu
de relire l'état à jour.

---

## 2. Correspondance par section

| Cahier des charges | Implémentation |
| ------------------ | -------------- |
| §2.1 Référentiel | `domain/planning.ts`, `domain/seat-map.ts` |
| §2.2 Planification | `domain/planning.ts` — `createTrip` |
| §2.3 Allocation par canal | `domain/seats.ts` — `materialiseTripSeats`, `rebalanceChannel` |
| §2.4 Vente au guichet | `domain/bookings.ts` — `posSell` ; `domain/cash.ts` |
| §2.5 Réservation passager | `domain/bookings.ts` — `holdSeats`, `createBooking` |
| §2.6 Revente et transfert | `domain/resale.ts` |
| §2.7 Embarquement | `domain/boarding.ts`, `lib/client/qr-verify.ts` |
| §2.8 Machines à états | `domain/types.ts` (types), `domain/seats.ts` + `domain/tickets.ts` (transitions) |
| §2.9 Annulation, report, no-show | `domain/cancellation.ts` |
| §2.10 Règles commerciales | `domain/settlements.ts`, `domain/cancellation.ts` |
| §2.11 Rapports et alertes | `domain/settlements.ts` — `revenueReport` ; `domain/audit.ts` |
| §3.1 Architecture | `core/time.ts`, `payments/provider.ts`, `sms/index.ts`, `domain/qr.ts` |
| §3.2 Paiements | `domain/payments.ts`, `payments/` |
| §3.3 Sécurité | `auth/`, `domain/audit.ts` |
| §3.5 Modèle de données | `db/schema.sql` |

---

## 3. Les mécanismes qui portent la garantie

### 3.1 Verrou de siège (§2.5)

`lockSeats()` s'exécute en transaction immédiate, relit chaque siège, et
n'accepte que `DISPONIBLE`. Deux guichetiers simultanés : l'un réussit, l'autre
reçoit `SIEGE_INDISPONIBLE`.

Durée : **7 minutes**, pas 5 — un flux Mobile Money demande la saisie d'un PIN
et la confirmation de l'opérateur. Prolongation automatique de 15 minutes dès
qu'un paiement est initié.

Un même numéro ne détient pas plus de 3 verrous simultanés.

Les verrous expirés sont libérés **à la lecture** (`releaseExpiredLocks`)
plutôt que par une tâche de fond : une tâche cron en panne bloquerait
silencieusement des sièges pendant des jours.

### 3.2 Idempotence des paiements (§3.2)

L'unicité est portée par l'index unique `payments(idempotency_key)` — c'est la
base qui refuse le doublon, pas un test applicatif qui se ferait doubler par
deux requêtes simultanées.

Cycle de résolution :

1. `initiatePayment` crée le paiement en `INITIE` et prolonge le verrou.
2. Le **webhook** (`/api/webhooks/paiements`) est le mécanisme principal. Sa
   signature HMAC est vérifiée **sur le corps brut**, avant toute lecture
   métier : un webhook non signé pourrait sinon faire émettre des billets.
3. Le **polling** (`/api/paiements/{id}/statut`) prend le relais toutes les 30 s
   pendant 5 minutes.
4. Passé ce délai sans réponse ferme : statut `INDETERMINE`, **le siège reste
   verrouillé**, un ticket support s'ouvre. Un humain tranche.

`settlePayment` est idempotent : un webhook rejoué n'émet pas un second jeu de
billets.

### 3.3 Revente atomique (§2.6)

`completeResale()` exécute en **une seule transaction** :

- ancien billet → `ANNULE_REVENDU` (son QR ne vaut plus rien) ;
- nouveau billet → `EMIS`, nouveau QR, nouveau titulaire ;
- remboursement du vendeur mis en file, vers le numéro du **paiement initial**.

Le siège **ne repasse jamais par `DISPONIBLE`** : il reste `VENDU` du début à la
fin. C'est ce qui rend la double vente structurellement impossible pendant une
revente.

Échec partiel : tout est annulé. Un ancien QR encore valide après revente, c'est
un passager refusé à l'embarquement.

### 3.4 Numérotation séquentielle (§2.4)

Le compteur vit sur la ligne `agencies` et s'incrémente **dans la même
transaction que le billet** : deux guichetiers ne peuvent pas obtenir le même
numéro, et un rollback ne laisse pas de trou.

`detectSequenceGaps()` vérifie la continuité et lève une alerte au premier trou.

### 3.5 QR signé, vérifiable hors-ligne (§3.1, §2.7)

Format : `MBO1|ticketId|tripId|seat|HMAC-base64url` tronqué à 22 caractères.

Deux implémentations coexistent :

- `domain/qr.ts` — `node:crypto`, côté serveur, **signe** ;
- `client/qr-verify.ts` — Web Crypto, dans le terminal contrôleur, **vérifie**.

Si elles divergent d'un octet, tous les billets déjà émis deviennent
inscannables hors connexion. `tests/qr-navigateur.test.ts` les compare à chaque
exécution.

La rotation de clé est prévue : `verifyQr` accepte la clé courante **puis** la
précédente, pour qu'un billet émis avant la rotation reste scannable jusqu'à son
départ.

### 3.6 Mode hors-ligne (§2.4, §2.7)

**POS** — `lib/client/offline.ts`. Le terminal conserve le quota guichet du jour
et vend **strictement dans sa limite**. Chaque vente porte un `clientOpId` ;
`sync_log(client_op_id)` est unique, donc rejouer le lot entier est sans
conséquence.

**Contrôleur** — `lib/client/manifeste.ts`. Le manifeste embarque la clé HMAC de
la compagnie. L'anti-rejeu est local : le premier scan marque le billet sur le
terminal, un second passage est refusé sans réseau.

Une vente refusée à la synchronisation n'est **pas effacée** : elle reste
visible pour que le gérant rembourse le passager encaissé hors-ligne.

### 3.7 Horodatage serveur (§3.1)

`core/time.ts` est le seul point d'entrée temporel du domaine. L'heure d'un POS
ou d'un terminal contrôleur est stockée (`sync_log.client_time`,
`boarding_scans` conserve les deux) mais **ne décide de rien**.

Conséquence directe sur le no-show (§2.9) : un billet passe à `EXPIRE` si et
seulement si `trips.departed_at` est renseigné et qu'aucun scan accepté
n'existe. Le départ effectif fait foi, jamais l'horaire théorique.

---

## 4. Sécurité (§3.3)

- **PIN Mobile Money** : jamais saisi, jamais stocké, jamais transmis.
  L'interface `PaymentProvider` ne comporte aucun champ qui pourrait en
  contenir.
- **Staff** : mot de passe haché en **scrypt** (`N=16384`), bibliothèque
  standard, sans dépendance native à compiler sur une machine d'agence.
- **Passagers** : aucun mot de passe. OTP SMS, 5 minutes, 5 tentatives, haché en
  base.
- **Sessions** : cookie `httpOnly`, `SameSite=Lax`, `Secure` en production,
  portant `sessionId.signatureHMAC`. La session reste stockée en base pour
  pouvoir être **révoquée** — un jeton auto-porteur ne s'annule pas.
- **Rôles** : une seule casquette active par session, bascule explicite et
  tracée.
- **Journal d'audit** : écriture seule, aucune fonction de mise à jour ou de
  suppression n'est exposée. Conservation 24 mois.

---

## 5. Ce qui est simulé

| Composant | État | Pour brancher le réel |
| --------- | ---- | --------------------- |
| Opérateurs Mobile Money | `SimulatedProvider` | Implémenter `PaymentProvider`, l'enregistrer dans `payments/registry.ts` |
| Passerelle SMS | journalisation en base | Implémenter `SmsProvider`, appeler `configureSmsProviders()` |

Le simulateur ne réussit pas toujours : le numéro du payeur pilote le scénario
(échec, absence de réponse, confirmation). Un fournisseur qui répond toujours
« oui » ne teste rien.

Aucun autre composant n'est simulé. Les verrous, les transactions, la
signature des QR, le calcul d'écart de caisse et le moteur de reversement sont
l'implémentation définitive.
