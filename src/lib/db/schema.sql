-- ---------------------------------------------------------------------------
-- Mobembo — schéma de la plateforme de billetterie bus (RDC)
-- Référence : cahier des charges §3.5 « Modèle de données ».
--
-- Règle directrice (§1.2) : cette base est la SEULE source de vérité sur
-- l'état d'un siège. Toute la logique de vente s'appuie sur `trip_seats`.
-- Les montants sont stockés en centimes (entiers) pour éviter les flottants.
-- Les horodatages sont des chaînes ISO 8601 UTC produites par le serveur.
-- ---------------------------------------------------------------------------

PRAGMA foreign_keys = ON;

-- §2.1 Référentiel -----------------------------------------------------------

CREATE TABLE IF NOT EXISTS companies (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  logo              TEXT,
  status            TEXT NOT NULL DEFAULT 'ACTIVE',      -- ACTIVE | SUSPENDUE
  commission_rate   REAL NOT NULL DEFAULT 0.06,          -- §2.10 : 6 à 8 %
  currency_rate_usd_cdf REAL NOT NULL DEFAULT 2800,      -- §3.2 taux daté
  currency_rate_at  TEXT,
  qr_secret         TEXT NOT NULL,                       -- §3.1 clé HMAC, rotation prévue
  qr_secret_previous TEXT,                               -- clé sortante (fenêtre de rotation)
  qr_secret_rotated_at TEXT,
  -- §2.9 Grille d'annulation paramétrable par compagnie
  policy_json       TEXT NOT NULL,
  created_at        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agencies (
  id            TEXT PRIMARY KEY,
  company_id    TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  city          TEXT NOT NULL,
  address       TEXT,
  gps           TEXT,
  opening_hours TEXT,
  status        TEXT NOT NULL DEFAULT 'ACTIVE',
  -- §2.4 numérotation séquentielle et continue PAR AGENCE
  ticket_sequence INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id             TEXT PRIMARY KEY,
  phone          TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  password_hash  TEXT,                                   -- staff uniquement (§3.3)
  status         TEXT NOT NULL DEFAULT 'ACTIVE',         -- ACTIVE | SUSPENDU
  locale         TEXT NOT NULL DEFAULT 'fr',             -- §3.1 i18n
  created_at     TEXT NOT NULL
);

-- §1.5 : un utilisateur cumule plusieurs rôles, jamais dans la même session.
CREATE TABLE IF NOT EXISTS user_roles (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL,   -- SUPER_ADMIN|ADMIN_COMPAGNIE|GERANT_AGENCE|GUICHETIER|CONTROLEUR|PASSAGER
  company_id TEXT REFERENCES companies(id) ON DELETE CASCADE,
  agency_id  TEXT REFERENCES agencies(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  UNIQUE (user_id, role, company_id, agency_id)
);

-- §2.1 : gabarit réutilisable, éditable graphiquement, aucun plan codé en dur.
CREATE TABLE IF NOT EXISTS seat_maps (
  id             TEXT PRIMARY KEY,
  company_id     TEXT REFERENCES companies(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  rows           INTEGER NOT NULL,
  layout_json    TEXT NOT NULL,      -- { columns: ["A","B","aisle","C","D"], labels: {...} }
  disabled_seats TEXT NOT NULL DEFAULT '[]',
  seat_count     INTEGER NOT NULL,
  created_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS buses (
  id           TEXT PRIMARY KEY,
  company_id   TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  plate_number TEXT NOT NULL,
  seat_map_id  TEXT NOT NULL REFERENCES seat_maps(id),
  category     TEXT NOT NULL DEFAULT 'STANDARD',  -- VIP | STANDARD
  status       TEXT NOT NULL DEFAULT 'ACTIF',
  created_at   TEXT NOT NULL,
  UNIQUE (company_id, plate_number)
);

CREATE TABLE IF NOT EXISTS routes (
  id               TEXT PRIMARY KEY,
  company_id       TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  origin_city      TEXT NOT NULL,
  destination_city TEXT NOT NULL,
  distance_km      INTEGER,
  duration_est_min INTEGER,
  created_at       TEXT NOT NULL
);

-- §2.2 Planification ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS trips (
  id                 TEXT PRIMARY KEY,
  company_id         TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  route_id           TEXT NOT NULL REFERENCES routes(id),
  bus_id             TEXT NOT NULL REFERENCES buses(id),
  origin_agency_id   TEXT REFERENCES agencies(id),
  departure_datetime TEXT NOT NULL,
  -- HORAIRE_FIXE : seul mode autorisé pour la vente en ligne (§2.2)
  departure_mode     TEXT NOT NULL DEFAULT 'HORAIRE_FIXE',
  status             TEXT NOT NULL DEFAULT 'PLANIFIE',  -- PLANIFIE|EN_VENTE|PARTI|CLOTURE|ANNULE
  departed_at        TEXT,                              -- §2.9 le départ effectif fait foi
  manifest_closed_at TEXT,
  created_at         TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS trip_prices (
  id         TEXT PRIMARY KEY,
  trip_id    TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  category   TEXT NOT NULL,          -- VIP | STANDARD
  price_usd  INTEGER NOT NULL,       -- centimes USD
  price_cdf  INTEGER NOT NULL,       -- centimes CDF
  UNIQUE (trip_id, category)
);

-- §2.3 Allocation de sièges par canal
CREATE TABLE IF NOT EXISTS trip_seat_allocations (
  id           TEXT PRIMARY KEY,
  trip_id      TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  channel      TEXT NOT NULL,        -- GUICHET | EN_LIGNE | RESERVE_COMPAGNIE
  quota        INTEGER NOT NULL,
  allocated_at TEXT NOT NULL,
  allocated_by TEXT REFERENCES users(id),
  UNIQUE (trip_id, channel)
);

-- §2.8 machine à états du siège. Table pivot de tout le système.
CREATE TABLE IF NOT EXISTS trip_seats (
  id              TEXT PRIMARY KEY,
  trip_id         TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  seat_number     TEXT NOT NULL,
  -- DISPONIBLE | VERROUILLE | VENDU | EMBARQUE | ANNULE | BLOQUE_ADMIN
  status          TEXT NOT NULL DEFAULT 'DISPONIBLE',
  channel         TEXT NOT NULL,     -- canal propriétaire du siège
  locked_until    TEXT,
  lock_session_id TEXT,
  lock_phone      TEXT,              -- §2.5 max 3 verrous par numéro
  UNIQUE (trip_id, seat_number)
);

-- §2.5 / §2.4 Ventes ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS bookings (
  id              TEXT PRIMARY KEY,
  trip_id         TEXT NOT NULL REFERENCES trips(id),
  buyer_phone     TEXT NOT NULL,
  buyer_name      TEXT,
  channel         TEXT NOT NULL,     -- GUICHET | EN_LIGNE | RESERVE_COMPAGNIE
  agency_id       TEXT REFERENCES agencies(id),
  sold_by_user_id TEXT REFERENCES users(id),
  cash_session_id TEXT,
  total_amount    INTEGER NOT NULL,
  currency        TEXT NOT NULL,     -- USD | CDF
  status          TEXT NOT NULL DEFAULT 'EN_ATTENTE', -- EN_ATTENTE|CONFIRME|EXPIRE|ANNULE
  credit_applied  INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL,
  confirmed_at    TEXT
);

CREATE TABLE IF NOT EXISTS tickets (
  id               TEXT PRIMARY KEY,
  booking_id       TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  trip_seat_id     TEXT NOT NULL REFERENCES trip_seats(id),
  trip_id          TEXT NOT NULL REFERENCES trips(id),
  passenger_name   TEXT NOT NULL,
  passenger_phone  TEXT NOT NULL,
  ticket_code      TEXT NOT NULL UNIQUE,
  sequence_number  INTEGER,          -- §2.4 séquence continue par agence
  agency_id        TEXT REFERENCES agencies(id),
  qr_signature     TEXT NOT NULL,
  -- §2.8 EMIS|EN_REVENTE|ANNULE_REVENDU|TRANSFERE|EMBARQUE|ANNULE|EXPIRE
  status           TEXT NOT NULL DEFAULT 'EMIS',
  price_amount     INTEGER NOT NULL,
  price_currency   TEXT NOT NULL,
  parent_ticket_id TEXT REFERENCES tickets(id),
  resold_count     INTEGER NOT NULL DEFAULT 0,  -- §2.6 un billet revendu une seule fois
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);

-- §2.6 Revente
CREATE TABLE IF NOT EXISTS resale_listings (
  id                TEXT PRIMARY KEY,
  ticket_id         TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  trip_id           TEXT NOT NULL REFERENCES trips(id),
  seller_phone      TEXT NOT NULL,
  price_amount      INTEGER NOT NULL,  -- prix d'achat original, non modifiable
  price_currency    TEXT NOT NULL,
  listed_at         TEXT NOT NULL,
  expires_at        TEXT NOT NULL,     -- départ − 4 h
  status            TEXT NOT NULL DEFAULT 'ACTIVE', -- ACTIVE|VENDUE|EXPIREE|RETIREE
  sold_to_ticket_id TEXT REFERENCES tickets(id),
  fee_amount        INTEGER,
  sold_at           TEXT
);

-- §3.2 Paiements
CREATE TABLE IF NOT EXISTS payments (
  id              TEXT PRIMARY KEY,
  booking_id      TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  provider        TEXT NOT NULL,   -- MPESA | ORANGE_MONEY | AIRTEL_MONEY | ESPECES
  provider_ref    TEXT,
  idempotency_key TEXT NOT NULL,
  payer_phone     TEXT NOT NULL,
  amount          INTEGER NOT NULL,
  currency        TEXT NOT NULL,
  fx_rate         REAL,            -- taux appliqué (§3.2 multi-devises)
  fx_rate_at      TEXT,
  -- INITIE | CONFIRME | ECHOUE | INDETERMINE | REMBOURSE
  status          TEXT NOT NULL DEFAULT 'INITIE',
  raw_response    TEXT,
  polls           INTEGER NOT NULL DEFAULT 0,
  last_polled_at  TEXT,
  created_at      TEXT NOT NULL,
  resolved_at     TEXT
);

CREATE TABLE IF NOT EXISTS refunds (
  id           TEXT PRIMARY KEY,
  ticket_id    TEXT REFERENCES tickets(id),
  booking_id   TEXT REFERENCES bookings(id),
  amount       INTEGER NOT NULL,
  currency     TEXT NOT NULL,
  target_phone TEXT NOT NULL,      -- §2.6 toujours le numéro du paiement initial
  provider     TEXT NOT NULL,
  reason       TEXT,
  liable       TEXT NOT NULL DEFAULT 'COMPAGNIE', -- §2.10 grille de responsabilité
  status       TEXT NOT NULL DEFAULT 'EN_FILE',   -- EN_FILE|ENVOYE|CONFIRME|ECHOUE
  attempts     INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL,
  settled_at   TEXT
);

-- §2.4 Session de caisse
CREATE TABLE IF NOT EXISTS cash_sessions (
  id             TEXT PRIMARY KEY,
  agency_id      TEXT NOT NULL REFERENCES agencies(id),
  user_id        TEXT NOT NULL REFERENCES users(id),
  opened_at      TEXT NOT NULL,
  opening_float  INTEGER NOT NULL,
  currency       TEXT NOT NULL DEFAULT 'USD',
  closed_at      TEXT,
  counted_amount INTEGER,
  variance       INTEGER,
  device_id      TEXT,
  created_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cash_movements (
  id              TEXT PRIMARY KEY,
  cash_session_id TEXT NOT NULL REFERENCES cash_sessions(id) ON DELETE CASCADE,
  booking_id      TEXT REFERENCES bookings(id),
  type            TEXT NOT NULL,   -- VENTE | REMBOURSEMENT | ANNULATION
  amount          INTEGER NOT NULL,
  currency        TEXT NOT NULL,
  label           TEXT,
  created_at      TEXT NOT NULL
);

-- §2.7 Embarquement
CREATE TABLE IF NOT EXISTS boarding_scans (
  id         TEXT PRIMARY KEY,
  ticket_id  TEXT NOT NULL REFERENCES tickets(id),
  trip_id    TEXT NOT NULL REFERENCES trips(id),
  scanned_by TEXT REFERENCES users(id),
  scanned_at TEXT NOT NULL,         -- horodatage terminal, informatif
  device_id  TEXT,
  result     TEXT NOT NULL,         -- ACCEPTE | DEJA_SCANNE | REFUSE
  synced_at  TEXT
);

-- §3.3 Journal d'audit, écriture seule, conservation 24 mois
CREATE TABLE IF NOT EXISTS audit_log (
  id         TEXT PRIMARY KEY,
  user_id    TEXT,
  role       TEXT,
  company_id TEXT,
  action     TEXT NOT NULL,
  entity     TEXT NOT NULL,
  entity_id  TEXT,
  before_json TEXT,
  after_json  TEXT,
  ip         TEXT,
  device     TEXT,
  created_at TEXT NOT NULL
);

-- §2.10 Abonnement, reversement, avoirs
CREATE TABLE IF NOT EXISTS subscriptions (
  id             TEXT PRIMARY KEY,
  company_id     TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  plan           TEXT NOT NULL,     -- STARTER | STANDARD | FLOTTE
  buses_count    INTEGER NOT NULL,
  monthly_amount INTEGER NOT NULL,
  currency       TEXT NOT NULL DEFAULT 'USD',
  period_start   TEXT NOT NULL,
  period_end     TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'ACTIF',  -- PILOTE_GRATUIT | ACTIF | DU | PAYE
  created_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settlements (
  id               TEXT PRIMARY KEY,
  company_id       TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  period_start     TEXT NOT NULL,
  period_end       TEXT NOT NULL,
  gross_sales      INTEGER NOT NULL DEFAULT 0,
  commission       INTEGER NOT NULL DEFAULT 0,
  refunds_charged  INTEGER NOT NULL DEFAULT 0,
  penalties        INTEGER NOT NULL DEFAULT 0,
  subscription_due INTEGER NOT NULL DEFAULT 0,
  guarantee_hold   INTEGER NOT NULL DEFAULT 0,  -- réserve de garantie roulante
  net_payable      INTEGER NOT NULL DEFAULT 0,
  currency         TEXT NOT NULL DEFAULT 'USD',
  status           TEXT NOT NULL DEFAULT 'CALCULE', -- CALCULE | PAYE
  created_at       TEXT NOT NULL,
  paid_at          TEXT,
  UNIQUE (company_id, period_start, period_end)
);

CREATE TABLE IF NOT EXISTS settlement_lines (
  id            TEXT PRIMARY KEY,
  settlement_id TEXT NOT NULL REFERENCES settlements(id) ON DELETE CASCADE,
  type          TEXT NOT NULL,   -- VENTE|COMMISSION|REMBOURSEMENT|PENALITE|ABONNEMENT|RESERVE
  reference_id  TEXT,
  amount        INTEGER NOT NULL,
  currency      TEXT NOT NULL,
  label         TEXT
);

CREATE TABLE IF NOT EXISTS company_ledger (
  id            TEXT PRIMARY KEY,
  company_id    TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  entry_type    TEXT NOT NULL,
  amount        INTEGER NOT NULL,
  currency      TEXT NOT NULL,
  balance_after INTEGER NOT NULL,
  reference     TEXT,
  created_at    TEXT NOT NULL
);

-- §2.9 L'avoir plutôt que l'espèce
CREATE TABLE IF NOT EXISTS credits (
  id                  TEXT PRIMARY KEY,
  passenger_phone     TEXT NOT NULL,
  company_id          TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  amount              INTEGER NOT NULL,
  currency            TEXT NOT NULL,
  origin_ticket_id    TEXT REFERENCES tickets(id),
  issued_at           TEXT NOT NULL,
  expires_at          TEXT NOT NULL,
  consumed_booking_id TEXT REFERENCES bookings(id),
  status              TEXT NOT NULL DEFAULT 'ACTIF', -- ACTIF | CONSOMME | EXPIRE
  created_at          TEXT NOT NULL
);

-- Sessions applicatives (staff + passagers OTP) — §3.3
CREATE TABLE IF NOT EXISTS auth_sessions (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  active_role  TEXT NOT NULL,      -- §1.5 une seule casquette active
  company_id   TEXT,
  agency_id    TEXT,
  created_at   TEXT NOT NULL,
  expires_at   TEXT NOT NULL,
  revoked_at   TEXT
);

CREATE TABLE IF NOT EXISTS otp_codes (
  id         TEXT PRIMARY KEY,
  phone      TEXT NOT NULL,
  code_hash  TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts   INTEGER NOT NULL DEFAULT 0,
  consumed_at TEXT,
  created_at TEXT NOT NULL
);

-- Passerelle SMS (§3.1) — journal des envois, bascule fournisseur
CREATE TABLE IF NOT EXISTS sms_outbox (
  id         TEXT PRIMARY KEY,
  phone      TEXT NOT NULL,
  body       TEXT NOT NULL,
  kind       TEXT NOT NULL,
  provider   TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'ENVOYE',
  failover   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

-- §3.2 statut INDETERMINE : « un humain tranche »
CREATE TABLE IF NOT EXISTS support_tickets (
  id         TEXT PRIMARY KEY,
  kind       TEXT NOT NULL,
  reference  TEXT,
  severity   TEXT NOT NULL DEFAULT 'MAJEURE',
  body       TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'OUVERT',
  created_at TEXT NOT NULL,
  closed_at  TEXT
);

-- §2.11 Alertes automatiques
CREATE TABLE IF NOT EXISTS alerts (
  id            TEXT PRIMARY KEY,
  company_id    TEXT,
  agency_id     TEXT,
  kind          TEXT NOT NULL,  -- TROU_SEQUENCE | ECART_CAISSE | ANNULATIONS_ANORMALES
  severity      TEXT NOT NULL DEFAULT 'MAJEURE',
  body          TEXT NOT NULL,
  reference     TEXT,
  acknowledged_at TEXT,
  created_at    TEXT NOT NULL
);

-- File de synchronisation hors-ligne (§2.4 POS, §2.7 contrôleur)
CREATE TABLE IF NOT EXISTS sync_log (
  id            TEXT PRIMARY KEY,
  device_id     TEXT NOT NULL,
  client_op_id  TEXT NOT NULL UNIQUE,   -- idempotence de la synchronisation
  kind          TEXT NOT NULL,
  payload_json  TEXT NOT NULL,
  result        TEXT NOT NULL,
  server_ref    TEXT,
  client_time   TEXT,
  server_time   TEXT NOT NULL
);

-- Index critiques (§3.5) --------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_trip_seats_trip_status ON trip_seats(trip_id, status);
CREATE INDEX IF NOT EXISTS idx_trip_seats_locked_until ON trip_seats(locked_until);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_code ON tickets(ticket_code);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_idempotency ON payments(idempotency_key);
-- Complémentaires
CREATE INDEX IF NOT EXISTS idx_tickets_trip ON tickets(trip_id, status);
CREATE INDEX IF NOT EXISTS idx_tickets_phone ON tickets(passenger_phone);
CREATE INDEX IF NOT EXISTS idx_bookings_trip ON bookings(trip_id);
CREATE INDEX IF NOT EXISTS idx_trips_departure ON trips(departure_datetime, status);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_resale_trip_status ON resale_listings(trip_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_agency_sequence
  ON tickets(agency_id, sequence_number) WHERE sequence_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_boarding_ticket ON boarding_scans(ticket_id);
CREATE INDEX IF NOT EXISTS idx_credits_phone ON credits(passenger_phone, status);
