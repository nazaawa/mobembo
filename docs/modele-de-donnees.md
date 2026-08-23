# Modèle de données

Schéma complet : [`src/lib/db/schema.sql`](../src/lib/db/schema.sql), commenté
section par section.

## Conventions

- **Montants** : entiers, en centimes (USD ou CDF). Aucun flottant ne touche une
  recette — §5.1 exige un écart de caisse exact.
- **Horodatages** : chaînes ISO 8601 UTC, **produites par le serveur** (§3.1).
- **Identifiants** : `préfixe_16hex` (`tkt_…`, `trp_…`, `bkg_…`), lisibles dans
  un journal.

## Tables

### Référentiel (§2.1)

| Table | Rôle |
| ----- | ---- |
| `companies` | Compagnies. Porte la clé HMAC des QR, le taux de change daté, la grille de renoncement (`policy_json`). |
| `agencies` | Points de vente. `ticket_sequence` porte la numérotation continue (§2.4). |
| `users`, `user_roles` | Comptes et rôles. Un utilisateur cumule plusieurs rôles, jamais dans la même session. |
| `seat_maps` | Gabarits réutilisables : rangées, disposition, sièges désactivés. |
| `buses` | Plaque, plan de sièges, catégorie. |
| `routes` | Origine, destination, distance, durée estimée. |

### Planification et sièges (§2.2, §2.3, §2.8)

| Table | Rôle |
| ----- | ---- |
| `trips` | Départ. `departed_at` — départ **effectif**, distinct de l'horaire. |
| `trip_prices` | Grille tarifaire par catégorie, dans les deux devises. |
| `trip_seat_allocations` | Quotas par canal, avec traçabilité du rééquilibrage. |
| `trip_seats` | **Table pivot.** État de chaque siège, canal propriétaire, verrou. |

### Vente (§2.4, §2.5)

| Table | Rôle |
| ----- | ---- |
| `bookings` | Réservation : un paiement, un ou plusieurs billets. |
| `tickets` | Billet : passager, code, QR signé, numéro de séquence, statut. |
| `payments` | `idempotency_key` **unique** — c'est la base qui refuse le double débit. |
| `refunds` | File de remboursements, avec l'imputation (§2.10). |
| `credits` | Avoirs : montant, validité, compagnie émettrice. |

### Caisse (§2.4)

| Table | Rôle |
| ----- | ---- |
| `cash_sessions` | Ouverture, fond initial, fermeture, montant compté, écart. |
| `cash_movements` | Un mouvement par vente et par remboursement. |

### Revente et embarquement (§2.6, §2.7)

| Table | Rôle |
| ----- | ---- |
| `resale_listings` | Annonces. Le prix est celui de l'achat, non modifiable. |
| `boarding_scans` | Scans, avec le résultat et l'appareil. |

### Contrôle et exploitation (§2.10, §2.11, §3.3)

| Table | Rôle |
| ----- | ---- |
| `audit_log` | **Écriture seule.** Utilisateur, appareil, IP, valeurs avant/après. |
| `alerts` | Trou de séquence, écart de caisse, annulations anormales. |
| `support_tickets` | Ouverts automatiquement sur paiement indéterminé. |
| `subscriptions`, `settlements`, `settlement_lines`, `company_ledger` | Abonnement et reversement J+7. |
| `sms_outbox` | Journal des SMS, avec le fournisseur et la bascule éventuelle. |
| `sync_log` | File de synchronisation. `client_op_id` **unique** : l'idempotence hors-ligne. |
| `auth_sessions`, `otp_codes` | Sessions révocables et codes OTP hachés. |

## Index critiques (§3.5)

```sql
CREATE INDEX        idx_trip_seats_trip_status   ON trip_seats(trip_id, status);
CREATE INDEX        idx_trip_seats_locked_until  ON trip_seats(locked_until);
CREATE UNIQUE INDEX idx_tickets_code             ON tickets(ticket_code);
CREATE UNIQUE INDEX idx_payments_idempotency     ON payments(idempotency_key);
```

Complémentaires : `tickets(agency_id, sequence_number)` en unique partiel —
c'est lui qui rend un doublon de numéro de billet impossible, pas une
vérification applicative.

## Machines à états

### Siège (§2.8)

```
DISPONIBLE ──► VERROUILLE ──► VENDU ──► EMBARQUE
     ▲              │            │
     └──────────────┘            └──► ANNULE ──► DISPONIBLE
       (expiration)                   (par gérant)

VENDU ──► (visible « en revente », état inchangé) ──► VENDU (nouveau titulaire)
BLOQUE_ADMIN : hors circuit, réservé compagnie
```

### Billet (§2.8)

```
EMIS ──► EN_REVENTE ──► ANNULE_REVENDU
  │           │
  │           └──► EMIS  (délai dépassé, aucun acheteur)
  ├──► TRANSFERE  (nouveau ticket émis au bénéficiaire)
  ├──► EMBARQUE   (scanné, terminal)
  ├──► ANNULE     (par gérant, avec motif)
  └──► EXPIRE     (bus parti, jamais scanné = no-show)
```

## Export

Le schéma est un fichier SQL exécutable tel quel. Les données d'une compagnie
lui appartiennent et sont exportables à tout moment : le journal d'audit s'exporte
en CSV depuis le back-office, et la base entière est un fichier SQLite unique.
