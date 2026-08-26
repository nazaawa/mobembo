-- ---------------------------------------------------------------------------
-- Mobembo — schéma de la plateforme de billetterie bus (RDC)
-- Référence : cahier des charges §3.5 « Modèle de données ».
--
-- Règle directrice (§1.2) : cette base est la SEULE source de vérité sur
-- l'état d'un siège. Toute la logique de vente s'appuie sur trip_seats.
-- Les montants sont stockés en centimes (entiers) pour éviter les flottants.
-- Les horodatages sont des chaînes ISO 8601 UTC produites par le serveur
-- (comparaison lexicographique, jamais de fonction de date SQL dessus).
-- ---------------------------------------------------------------------------

-- §2.1 Référentiel -----------------------------------------------------------

CREATE TABLE IF NOT EXISTS companies (
  id                VARCHAR(32) PRIMARY KEY,
  name              TEXT NOT NULL,
  logo              TEXT,
  status            VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',      -- ACTIVE | SUSPENDUE
  kind              VARCHAR(30) NOT NULL DEFAULT 'COMPAGNIE',   -- COMPAGNIE | INDEPENDANT — étiquette d'affichage
  commission_rate   DOUBLE NOT NULL DEFAULT 0.06,               -- §2.10 : 6 à 8 %
  currency_rate_usd_cdf DOUBLE NOT NULL DEFAULT 2800,           -- §3.2 taux daté
  currency_rate_at  VARCHAR(32),
  qr_secret         TEXT NOT NULL,                              -- §3.1 clé HMAC, rotation prévue
  qr_secret_previous TEXT,                                      -- clé sortante (fenêtre de rotation)
  qr_secret_rotated_at VARCHAR(32),
  -- §2.9 Grille d'annulation paramétrable par compagnie
  policy_json       TEXT NOT NULL,
  created_at        VARCHAR(32) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS agencies (
  id            VARCHAR(32) PRIMARY KEY,
  company_id    VARCHAR(32) NOT NULL,
  name          TEXT NOT NULL,
  city          VARCHAR(80) NOT NULL,
  address       TEXT,
  gps           VARCHAR(60),
  opening_hours TEXT,
  status        VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  -- §2.4 numérotation séquentielle et continue PAR AGENCE
  ticket_sequence INT NOT NULL DEFAULT 0,
  created_at    VARCHAR(32) NOT NULL,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users (
  id             VARCHAR(32) PRIMARY KEY,
  phone          VARCHAR(20) NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  password_hash  TEXT,                                   -- staff uniquement (§3.3)
  status         VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',   -- ACTIVE | SUSPENDU
  locale         VARCHAR(10) NOT NULL DEFAULT 'fr',       -- §3.1 i18n
  created_at     VARCHAR(32) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- §1.5 : un utilisateur cumule plusieurs rôles, jamais dans la même session.
CREATE TABLE IF NOT EXISTS user_roles (
  id         VARCHAR(32) PRIMARY KEY,
  user_id    VARCHAR(32) NOT NULL,
  role       VARCHAR(30) NOT NULL,   -- SUPER_ADMIN|ADMIN_COMPAGNIE|GERANT_AGENCE|GUICHETIER|CONTROLEUR|PASSAGER
  company_id VARCHAR(32),
  agency_id  VARCHAR(32),
  created_at VARCHAR(32) NOT NULL,
  UNIQUE (user_id, role, company_id, agency_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- §2.1 : gabarit réutilisable, éditable graphiquement, aucun plan codé en dur.
CREATE TABLE IF NOT EXISTS seat_maps (
  id             VARCHAR(32) PRIMARY KEY,
  company_id     VARCHAR(32),
  name           TEXT NOT NULL,
  -- "rows" est un mot réservé MySQL (fenêtrage ROWS BETWEEN) : colonne
  -- renommée, alias "AS rows" dans les SELECT pour ne rien changer côté TS.
  row_count      INT NOT NULL,
  layout_json    TEXT NOT NULL,      -- { columns: ["A","B","aisle","C","D"], labels: {...} }
  disabled_seats TEXT NOT NULL,
  seat_count     INT NOT NULL,
  created_at     VARCHAR(32) NOT NULL,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS buses (
  id           VARCHAR(32) PRIMARY KEY,
  company_id   VARCHAR(32) NOT NULL,
  plate_number VARCHAR(30) NOT NULL,
  seat_map_id  VARCHAR(32) NOT NULL,
  category     VARCHAR(30) NOT NULL DEFAULT 'STANDARD',  -- VIP | STANDARD
  vehicle_type VARCHAR(30) NOT NULL DEFAULT 'BUS',        -- BUS | VOITURE
  status       VARCHAR(30) NOT NULL DEFAULT 'ACTIF',
  created_at   VARCHAR(32) NOT NULL,
  UNIQUE (company_id, plate_number),
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (seat_map_id) REFERENCES seat_maps(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS routes (
  id               VARCHAR(32) PRIMARY KEY,
  company_id       VARCHAR(32) NOT NULL,
  origin_city      VARCHAR(80) NOT NULL,
  destination_city VARCHAR(80) NOT NULL,
  distance_km      INT,
  duration_est_min INT,
  created_at       VARCHAR(32) NOT NULL,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- §2.2 Planification ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS trips (
  id                 VARCHAR(32) PRIMARY KEY,
  company_id         VARCHAR(32) NOT NULL,
  route_id           VARCHAR(32) NOT NULL,
  bus_id             VARCHAR(32) NOT NULL,
  origin_agency_id   VARCHAR(32),
  departure_datetime VARCHAR(32) NOT NULL,
  -- HORAIRE_FIXE : seul mode autorisé pour la vente en ligne (§2.2)
  departure_mode     VARCHAR(30) NOT NULL DEFAULT 'HORAIRE_FIXE',
  status             VARCHAR(30) NOT NULL DEFAULT 'PLANIFIE',  -- PLANIFIE|EN_VENTE|PARTI|CLOTURE|ANNULE
  departed_at        VARCHAR(32),                              -- §2.9 le départ effectif fait foi
  manifest_closed_at VARCHAR(32),
  created_at         VARCHAR(32) NOT NULL,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (route_id) REFERENCES routes(id),
  FOREIGN KEY (bus_id) REFERENCES buses(id),
  FOREIGN KEY (origin_agency_id) REFERENCES agencies(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS trip_prices (
  id         VARCHAR(32) PRIMARY KEY,
  trip_id    VARCHAR(32) NOT NULL,
  category   VARCHAR(30) NOT NULL,          -- VIP | STANDARD
  price_usd  INT NOT NULL,                  -- centimes USD
  price_cdf  INT NOT NULL,                  -- centimes CDF
  UNIQUE (trip_id, category),
  FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- §2.3 Allocation de sièges par canal
CREATE TABLE IF NOT EXISTS trip_seat_allocations (
  id           VARCHAR(32) PRIMARY KEY,
  trip_id      VARCHAR(32) NOT NULL,
  channel      VARCHAR(30) NOT NULL,        -- GUICHET | EN_LIGNE | RESERVE_COMPAGNIE
  quota        INT NOT NULL,
  allocated_at VARCHAR(32) NOT NULL,
  allocated_by VARCHAR(32),
  UNIQUE (trip_id, channel),
  FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
  FOREIGN KEY (allocated_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- §2.8 machine à états du siège. Table pivot de tout le système.
CREATE TABLE IF NOT EXISTS trip_seats (
  id              VARCHAR(32) PRIMARY KEY,
  trip_id         VARCHAR(32) NOT NULL,
  seat_number     VARCHAR(20) NOT NULL,
  -- DISPONIBLE | VERROUILLE | VENDU | EMBARQUE | ANNULE | BLOQUE_ADMIN
  status          VARCHAR(30) NOT NULL DEFAULT 'DISPONIBLE',
  channel         VARCHAR(30) NOT NULL,     -- canal propriétaire du siège
  locked_until    VARCHAR(32),
  lock_session_id VARCHAR(32),
  -- §2.5 max 3 verrous par numéro. Pas toujours un numéro : holdSeats() y met
  -- l'identifiant de maintien (holdId) en secours quand l'appelant n'a pas
  -- encore de téléphone (§2.5.4) — d'où une largeur bien au-delà d'un +243…
  lock_phone      VARCHAR(64),
  UNIQUE (trip_id, seat_number),
  FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- §2.5 / §2.4 Ventes ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS bookings (
  id              VARCHAR(32) PRIMARY KEY,
  trip_id         VARCHAR(32) NOT NULL,
  buyer_phone     VARCHAR(20) NOT NULL,
  buyer_name      TEXT,
  channel         VARCHAR(30) NOT NULL,     -- GUICHET | EN_LIGNE | RESERVE_COMPAGNIE
  agency_id       VARCHAR(32),
  sold_by_user_id VARCHAR(32),
  cash_session_id VARCHAR(32),
  total_amount    INT NOT NULL,
  currency        VARCHAR(10) NOT NULL,     -- USD | CDF
  status          VARCHAR(30) NOT NULL DEFAULT 'EN_ATTENTE', -- EN_ATTENTE|CONFIRME|EXPIRE|ANNULE
  credit_applied  INT NOT NULL DEFAULT 0,
  created_at      VARCHAR(32) NOT NULL,
  confirmed_at    VARCHAR(32),
  FOREIGN KEY (trip_id) REFERENCES trips(id),
  FOREIGN KEY (agency_id) REFERENCES agencies(id),
  FOREIGN KEY (sold_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tickets (
  id               VARCHAR(32) PRIMARY KEY,
  booking_id       VARCHAR(32) NOT NULL,
  trip_seat_id     VARCHAR(32) NOT NULL,
  trip_id          VARCHAR(32) NOT NULL,
  passenger_name   TEXT NOT NULL,
  passenger_phone  VARCHAR(20) NOT NULL,
  ticket_code      VARCHAR(20) NOT NULL UNIQUE,
  sequence_number  INT,          -- §2.4 séquence continue par agence
  agency_id        VARCHAR(32),
  -- Colonne générée : reproduit l'index partiel SQLite
  -- (UNIQUE(agency_id, sequence_number) WHERE sequence_number IS NOT NULL).
  -- MySQL n'a pas d'index partiel, mais autorise plusieurs NULL dans un
  -- index UNIQUE : NULL tant que sequence_number est NULL donne la même
  -- sémantique exactement.
  agency_sequence_key VARCHAR(80) GENERATED ALWAYS AS (
    CASE WHEN sequence_number IS NOT NULL THEN CONCAT(agency_id, '-', sequence_number) ELSE NULL END
  ) STORED,
  qr_signature     TEXT NOT NULL,
  -- §2.8 EMIS|EN_REVENTE|ANNULE_REVENDU|TRANSFERE|EMBARQUE|ANNULE|EXPIRE
  status           VARCHAR(30) NOT NULL DEFAULT 'EMIS',
  price_amount     INT NOT NULL,
  price_currency   VARCHAR(10) NOT NULL,
  parent_ticket_id VARCHAR(32),
  resold_count     INT NOT NULL DEFAULT 0,  -- §2.6 un billet revendu une seule fois
  created_at       VARCHAR(32) NOT NULL,
  updated_at       VARCHAR(32) NOT NULL,
  UNIQUE (agency_sequence_key),
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  FOREIGN KEY (trip_seat_id) REFERENCES trip_seats(id),
  FOREIGN KEY (trip_id) REFERENCES trips(id),
  FOREIGN KEY (agency_id) REFERENCES agencies(id),
  FOREIGN KEY (parent_ticket_id) REFERENCES tickets(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- §2.6 Revente
CREATE TABLE IF NOT EXISTS resale_listings (
  id                VARCHAR(32) PRIMARY KEY,
  ticket_id         VARCHAR(32) NOT NULL,
  trip_id           VARCHAR(32) NOT NULL,
  seller_phone      VARCHAR(20) NOT NULL,
  price_amount      INT NOT NULL,  -- prix d'achat original, non modifiable
  price_currency    VARCHAR(10) NOT NULL,
  listed_at         VARCHAR(32) NOT NULL,
  expires_at        VARCHAR(32) NOT NULL,     -- départ − 4 h
  status            VARCHAR(30) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE|VENDUE|EXPIREE|RETIREE
  sold_to_ticket_id VARCHAR(32),
  fee_amount        INT,
  sold_at           VARCHAR(32),
  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  FOREIGN KEY (trip_id) REFERENCES trips(id),
  FOREIGN KEY (sold_to_ticket_id) REFERENCES tickets(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- §3.2 Paiements
CREATE TABLE IF NOT EXISTS payments (
  id              VARCHAR(32) PRIMARY KEY,
  booking_id      VARCHAR(32) NOT NULL,
  provider        VARCHAR(30) NOT NULL,   -- MPESA | ORANGE_MONEY | AIRTEL_MONEY | ESPECES
  provider_ref    VARCHAR(80),
  idempotency_key VARCHAR(80) NOT NULL,
  payer_phone     VARCHAR(20) NOT NULL,
  amount          INT NOT NULL,
  currency        VARCHAR(10) NOT NULL,
  fx_rate         DOUBLE,            -- taux appliqué (§3.2 multi-devises)
  fx_rate_at      VARCHAR(32),
  -- INITIE | CONFIRME | ECHOUE | INDETERMINE | REMBOURSE
  status          VARCHAR(30) NOT NULL DEFAULT 'INITIE',
  raw_response    TEXT,
  polls           INT NOT NULL DEFAULT 0,
  last_polled_at  VARCHAR(32),
  created_at      VARCHAR(32) NOT NULL,
  resolved_at     VARCHAR(32),
  UNIQUE (idempotency_key),
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS refunds (
  id           VARCHAR(32) PRIMARY KEY,
  ticket_id    VARCHAR(32),
  booking_id   VARCHAR(32),
  amount       INT NOT NULL,
  currency     VARCHAR(10) NOT NULL,
  target_phone VARCHAR(20) NOT NULL,      -- §2.6 toujours le numéro du paiement initial
  provider     VARCHAR(30) NOT NULL,
  reason       TEXT,
  liable       VARCHAR(30) NOT NULL DEFAULT 'COMPAGNIE', -- §2.10 grille de responsabilité
  status       VARCHAR(30) NOT NULL DEFAULT 'EN_FILE',   -- EN_FILE|ENVOYE|CONFIRME|ECHOUE
  attempts     INT NOT NULL DEFAULT 0,
  created_at   VARCHAR(32) NOT NULL,
  settled_at   VARCHAR(32),
  FOREIGN KEY (ticket_id) REFERENCES tickets(id),
  FOREIGN KEY (booking_id) REFERENCES bookings(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- §2.4 Session de caisse
CREATE TABLE IF NOT EXISTS cash_sessions (
  id             VARCHAR(32) PRIMARY KEY,
  agency_id      VARCHAR(32) NOT NULL,
  user_id        VARCHAR(32) NOT NULL,
  opened_at      VARCHAR(32) NOT NULL,
  opening_float  INT NOT NULL,
  currency       VARCHAR(10) NOT NULL DEFAULT 'USD',
  closed_at      VARCHAR(32),
  counted_amount INT,
  variance       INT,
  device_id      VARCHAR(60),
  created_at     VARCHAR(32) NOT NULL,
  FOREIGN KEY (agency_id) REFERENCES agencies(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cash_movements (
  id              VARCHAR(32) PRIMARY KEY,
  cash_session_id VARCHAR(32) NOT NULL,
  booking_id      VARCHAR(32),
  type            VARCHAR(30) NOT NULL,   -- VENTE | REMBOURSEMENT | ANNULATION
  amount          INT NOT NULL,
  currency        VARCHAR(10) NOT NULL,
  label           TEXT,
  created_at      VARCHAR(32) NOT NULL,
  FOREIGN KEY (cash_session_id) REFERENCES cash_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (booking_id) REFERENCES bookings(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- §2.7 Embarquement
CREATE TABLE IF NOT EXISTS boarding_scans (
  id         VARCHAR(32) PRIMARY KEY,
  ticket_id  VARCHAR(32) NOT NULL,
  trip_id    VARCHAR(32) NOT NULL,
  scanned_by VARCHAR(32),
  scanned_at VARCHAR(32) NOT NULL,         -- horodatage terminal, informatif
  device_id  VARCHAR(60),
  result     VARCHAR(30) NOT NULL,         -- ACCEPTE | DEJA_SCANNE | REFUSE
  synced_at  VARCHAR(32),
  FOREIGN KEY (ticket_id) REFERENCES tickets(id),
  FOREIGN KEY (trip_id) REFERENCES trips(id),
  FOREIGN KEY (scanned_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- §3.3 Journal d'audit, écriture seule, conservation 24 mois
CREATE TABLE IF NOT EXISTS audit_log (
  id         VARCHAR(32) PRIMARY KEY,
  user_id    VARCHAR(32),
  role       VARCHAR(30),
  company_id VARCHAR(32),
  action     VARCHAR(60) NOT NULL,
  entity     VARCHAR(60) NOT NULL,
  entity_id  VARCHAR(32),
  before_json TEXT,
  after_json  TEXT,
  ip         VARCHAR(60),
  device     TEXT,
  created_at VARCHAR(32) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- §2.10 Abonnement, reversement, avoirs
CREATE TABLE IF NOT EXISTS subscriptions (
  id             VARCHAR(32) PRIMARY KEY,
  company_id     VARCHAR(32) NOT NULL,
  plan           VARCHAR(30) NOT NULL,     -- STARTER | STANDARD | FLOTTE
  buses_count    INT NOT NULL,
  monthly_amount INT NOT NULL,
  currency       VARCHAR(10) NOT NULL DEFAULT 'USD',
  period_start   VARCHAR(32) NOT NULL,
  period_end     VARCHAR(32) NOT NULL,
  status         VARCHAR(30) NOT NULL DEFAULT 'ACTIF',  -- PILOTE_GRATUIT | ACTIF | DU | PAYE
  created_at     VARCHAR(32) NOT NULL,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS settlements (
  id               VARCHAR(32) PRIMARY KEY,
  company_id       VARCHAR(32) NOT NULL,
  period_start     VARCHAR(32) NOT NULL,
  period_end       VARCHAR(32) NOT NULL,
  gross_sales      INT NOT NULL DEFAULT 0,
  commission       INT NOT NULL DEFAULT 0,
  refunds_charged  INT NOT NULL DEFAULT 0,
  penalties        INT NOT NULL DEFAULT 0,
  subscription_due INT NOT NULL DEFAULT 0,
  guarantee_hold   INT NOT NULL DEFAULT 0,  -- réserve de garantie roulante
  net_payable      INT NOT NULL DEFAULT 0,
  currency         VARCHAR(10) NOT NULL DEFAULT 'USD',
  status           VARCHAR(30) NOT NULL DEFAULT 'CALCULE', -- CALCULE | PAYE
  created_at       VARCHAR(32) NOT NULL,
  paid_at          VARCHAR(32),
  UNIQUE (company_id, period_start, period_end),
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS settlement_lines (
  id            VARCHAR(32) PRIMARY KEY,
  settlement_id VARCHAR(32) NOT NULL,
  type          VARCHAR(30) NOT NULL,   -- VENTE|COMMISSION|REMBOURSEMENT|PENALITE|ABONNEMENT|RESERVE
  reference_id  VARCHAR(32),
  amount        INT NOT NULL,
  currency      VARCHAR(10) NOT NULL,
  label         TEXT,
  FOREIGN KEY (settlement_id) REFERENCES settlements(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS company_ledger (
  id            VARCHAR(32) PRIMARY KEY,
  company_id    VARCHAR(32) NOT NULL,
  entry_type    VARCHAR(30) NOT NULL,
  amount        INT NOT NULL,
  currency      VARCHAR(10) NOT NULL,
  balance_after INT NOT NULL,
  reference     VARCHAR(80),
  created_at    VARCHAR(32) NOT NULL,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- §2.9 L'avoir plutôt que l'espèce
CREATE TABLE IF NOT EXISTS credits (
  id                  VARCHAR(32) PRIMARY KEY,
  passenger_phone     VARCHAR(20) NOT NULL,
  company_id          VARCHAR(32) NOT NULL,
  amount              INT NOT NULL,
  currency            VARCHAR(10) NOT NULL,
  origin_ticket_id    VARCHAR(32),
  issued_at           VARCHAR(32) NOT NULL,
  expires_at          VARCHAR(32) NOT NULL,
  consumed_booking_id VARCHAR(32),
  status              VARCHAR(30) NOT NULL DEFAULT 'ACTIF', -- ACTIF | CONSOMME | EXPIRE
  created_at          VARCHAR(32) NOT NULL,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (origin_ticket_id) REFERENCES tickets(id),
  FOREIGN KEY (consumed_booking_id) REFERENCES bookings(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sessions applicatives (staff + passagers OTP) — §3.3
CREATE TABLE IF NOT EXISTS auth_sessions (
  id           VARCHAR(32) PRIMARY KEY,
  user_id      VARCHAR(32) NOT NULL,
  active_role  VARCHAR(30) NOT NULL,      -- §1.5 une seule casquette active
  company_id   VARCHAR(32),
  agency_id    VARCHAR(32),
  created_at   VARCHAR(32) NOT NULL,
  expires_at   VARCHAR(32) NOT NULL,
  revoked_at   VARCHAR(32),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS otp_codes (
  id         VARCHAR(32) PRIMARY KEY,
  phone      VARCHAR(20) NOT NULL,
  code_hash  TEXT NOT NULL,
  expires_at VARCHAR(32) NOT NULL,
  attempts   INT NOT NULL DEFAULT 0,
  consumed_at VARCHAR(32),
  created_at VARCHAR(32) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Passerelle SMS (§3.1) — journal des envois, bascule fournisseur
CREATE TABLE IF NOT EXISTS sms_outbox (
  id         VARCHAR(32) PRIMARY KEY,
  phone      VARCHAR(20) NOT NULL,
  body       TEXT NOT NULL,
  kind       VARCHAR(30) NOT NULL,
  provider   VARCHAR(30) NOT NULL,
  status     VARCHAR(30) NOT NULL DEFAULT 'ENVOYE',
  failover   INT NOT NULL DEFAULT 0,
  created_at VARCHAR(32) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- §3.2 statut INDETERMINE : « un humain tranche »
CREATE TABLE IF NOT EXISTS support_tickets (
  id         VARCHAR(32) PRIMARY KEY,
  kind       VARCHAR(30) NOT NULL,
  reference  VARCHAR(80),
  severity   VARCHAR(30) NOT NULL DEFAULT 'MAJEURE',
  body       TEXT NOT NULL,
  status     VARCHAR(30) NOT NULL DEFAULT 'OUVERT',
  created_at VARCHAR(32) NOT NULL,
  closed_at  VARCHAR(32)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Onboarding des compagnies partenaires ------------------------------------
CREATE TABLE IF NOT EXISTS partner_applications (
  id              VARCHAR(32) PRIMARY KEY,
  application_type VARCHAR(30) NOT NULL DEFAULT 'COMPAGNIE', -- COMPAGNIE | INDEPENDANT
  company_name    TEXT NOT NULL,
  contact_name    TEXT NOT NULL,
  phone           VARCHAR(20) NOT NULL,
  email           VARCHAR(160),
  city            VARCHAR(80) NOT NULL,
  agency_name     TEXT NOT NULL,
  destinations    TEXT,
  fleet_size      INT,
  status          VARCHAR(30) NOT NULL DEFAULT 'EN_ATTENTE', -- EN_ATTENTE|APPROUVEE|REFUSEE
  company_id      VARCHAR(32),
  reviewed_by     VARCHAR(32),
  reviewed_at     VARCHAR(32),
  created_at      VARCHAR(32) NOT NULL,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL,
  FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- §2.11 Alertes automatiques
CREATE TABLE IF NOT EXISTS alerts (
  id            VARCHAR(32) PRIMARY KEY,
  company_id    VARCHAR(32),
  agency_id     VARCHAR(32),
  kind          VARCHAR(30) NOT NULL,  -- TROU_SEQUENCE | ECART_CAISSE | ANNULATIONS_ANORMALES
  severity      VARCHAR(30) NOT NULL DEFAULT 'MAJEURE',
  body          TEXT NOT NULL,
  reference     VARCHAR(80),
  acknowledged_at VARCHAR(32),
  created_at    VARCHAR(32) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- File de synchronisation hors-ligne (§2.4 POS, §2.7 contrôleur)
CREATE TABLE IF NOT EXISTS sync_log (
  id            VARCHAR(32) PRIMARY KEY,
  device_id     VARCHAR(60) NOT NULL,
  client_op_id  VARCHAR(80) NOT NULL UNIQUE,   -- idempotence de la synchronisation
  kind          VARCHAR(30) NOT NULL,
  payload_json  TEXT NOT NULL,
  result        VARCHAR(30) NOT NULL,
  server_ref    VARCHAR(80),
  client_time   VARCHAR(32),
  server_time   VARCHAR(32) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Migrations additives (colonnes ajoutées après la création initiale des
-- tables). Sur une base neuve, CREATE TABLE plus haut a déjà posé ces
-- colonnes : l'ALTER échoue avec "Duplicate column name" (1060), ignoré par
-- src/lib/db/index.ts au même titre que 1061 pour les index ci-dessous.
ALTER TABLE buses ADD COLUMN vehicle_type VARCHAR(30) NOT NULL DEFAULT 'BUS';
ALTER TABLE partner_applications ADD COLUMN application_type VARCHAR(30) NOT NULL DEFAULT 'COMPAGNIE';
ALTER TABLE companies ADD COLUMN kind VARCHAR(30) NOT NULL DEFAULT 'COMPAGNIE';

-- Index critiques (§3.5) --------------------------------------------------
CREATE INDEX idx_trip_seats_trip_status ON trip_seats(trip_id, status);
CREATE INDEX idx_trip_seats_locked_until ON trip_seats(locked_until);
-- Complémentaires
CREATE INDEX idx_tickets_trip ON tickets(trip_id, status);
CREATE INDEX idx_tickets_phone ON tickets(passenger_phone);
CREATE INDEX idx_bookings_trip ON bookings(trip_id);
CREATE INDEX idx_partner_applications_status ON partner_applications(status, created_at);
CREATE INDEX idx_trips_departure ON trips(departure_datetime, status);
CREATE INDEX idx_audit_created ON audit_log(created_at);
CREATE INDEX idx_resale_trip_status ON resale_listings(trip_id, status);
CREATE INDEX idx_boarding_ticket ON boarding_scans(ticket_id);
CREATE INDEX idx_credits_phone ON credits(passenger_phone, status);
