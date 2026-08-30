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

-- ---------------------------------------------------------------------------
-- PHASE 1 & 2 — référencement léger et réservation sans paiement
--
-- Note fonctionnelle mobile, §3.1 : « Les agences peuvent continuer à utiliser
-- leur fonctionnement actuel. » Une agence référencée doit pouvoir publier
-- « Kinshasa → Matadi, 08:00, tous les jours, 25 $ » sans plan de sièges, sans
-- bus immatriculé, sans paiement en ligne et sans quitter son organisation
-- actuelle. Les tables ci-dessous portent cette offre légère, à côté de la
-- table trips, qui reste le modèle complet des phases 3 à 5.
-- ---------------------------------------------------------------------------

-- §5.4 « Gestion des trajets » : le service régulier tel que l'agence
-- l'annonce. Aucune contrainte de flotte, aucun siège matérialisé.
CREATE TABLE IF NOT EXISTS schedules (
  id               VARCHAR(32) PRIMARY KEY,
  company_id       VARCHAR(32) NOT NULL,
  agency_id        VARCHAR(32),
  origin_city      VARCHAR(80) NOT NULL,
  destination_city VARCHAR(80) NOT NULL,
  -- Heure locale de Kinshasa au format "HH:MM". Un service régulier n'a pas
  -- de date : la date naît de la recherche du voyageur.
  departure_time   VARCHAR(5) NOT NULL,
  -- Jours de circulation, ISO 8601 (1 = lundi … 7 = dimanche), ex. "1,3,5".
  days_of_week     VARCHAR(20) NOT NULL DEFAULT '1,2,3,4,5,6,7',
  -- §4.3 « prix indicatif » : centimes, facultatifs, une devise suffit.
  price_usd        INT,
  price_cdf        INT,
  boarding_point   TEXT,
  boarding_gps     VARCHAR(60),
  vehicle_type     VARCHAR(30) NOT NULL DEFAULT 'BUS',
  vehicle_label    TEXT,
  duration_est_min INT,
  notes            TEXT,
  -- §11.1 Phase 2 : l'agence décide si elle ouvre des places sur Mobembo, et
  -- combien. Zéro par défaut — le référencement seul n'engage à rien.
  booking_enabled  TINYINT NOT NULL DEFAULT 0,
  online_quota     INT NOT NULL DEFAULT 0,
  status           VARCHAR(30) NOT NULL DEFAULT 'PUBLIE', -- PUBLIE|SUSPENDU|ARCHIVE
  -- §6 : « Mobembo peut désactiver temporairement une information
  -- manifestement incorrecte. » La suspension porte son motif.
  suspended_reason TEXT,
  suspended_by     VARCHAR(32),
  created_by       VARCHAR(32),
  created_at       VARCHAR(32) NOT NULL,
  -- §6 : « Les informations visibles doivent afficher leur dernière date de
  -- mise à jour. » Cette colonne est cette date, et elle est publique.
  updated_at       VARCHAR(32) NOT NULL,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (agency_id) REFERENCES agencies(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- §10.2 « Réserver une place » : nom, téléphone, nombre de places. Pas de
-- siège, pas de paiement, pas de billet. Le quota du jour est la seule
-- ressource disputée (§12 : « une place vendue est retirée du quota »).
CREATE TABLE IF NOT EXISTS schedule_bookings (
  id              VARCHAR(32) PRIMARY KEY,
  reference       VARCHAR(20) NOT NULL UNIQUE,
  schedule_id     VARCHAR(32) NOT NULL,
  company_id      VARCHAR(32) NOT NULL,
  -- Jour calendaire de Kinshasa "AAAA-MM-JJ" : le quota se compte par date.
  travel_date     VARCHAR(10) NOT NULL,
  -- Instant de départ recalculé à la réservation, pour trier et expirer sans
  -- refaire le calcul heure locale → UTC à chaque lecture.
  departure_at    VARCHAR(32) NOT NULL,
  passenger_name  TEXT NOT NULL,
  passenger_phone VARCHAR(20) NOT NULL,
  seats           INT NOT NULL DEFAULT 1,
  note            TEXT,
  -- CONFIRMEE | ANNULEE | TERMINEE — pas d'attente de paiement en phase 2.
  status          VARCHAR(30) NOT NULL DEFAULT 'CONFIRMEE',
  cancelled_by    VARCHAR(30),        -- VOYAGEUR | AGENCE
  cancel_reason   TEXT,
  -- Prix figé à la réservation : l'agence peut changer son tarif ensuite.
  price_usd       INT,
  price_cdf       INT,
  created_at      VARCHAR(32) NOT NULL,
  updated_at      VARCHAR(32) NOT NULL,
  cancelled_at    VARCHAR(32),
  FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- §14.1 PHASE 3 — paiement d'une réservation, via IdoloPay.
--
-- Table distincte de la table payments : celle-ci règle une réservation de
-- place (schedule_bookings), pas une vente de sièges. Les deux économies
-- diffèrent —
-- 10 % de commission ici (§17), 6 à 8 % sur la billetterie complète — et
-- mélanger les deux rendrait tout reversement ambigu.
CREATE TABLE IF NOT EXISTS schedule_payments (
  id                VARCHAR(32) PRIMARY KEY,
  reservation_id    VARCHAR(32) NOT NULL,
  company_id        VARCHAR(32) NOT NULL,
  provider          VARCHAR(30) NOT NULL,
  provider_ref      VARCHAR(80),
  idempotency_key   VARCHAR(80) NOT NULL,
  payer_phone       VARCHAR(20) NOT NULL,
  -- Ce que le voyageur paie réellement (centimes). §14.1 : prix x places.
  amount            INT NOT NULL,
  -- §14.1 « éventuels frais » : zéro chez Mobembo, la commission est prise
  -- côté agence. La colonne existe pour que le montant affiché reste exact
  -- le jour où un opérateur en facturerait.
  fee_amount        INT NOT NULL DEFAULT 0,
  -- §17 : la part Mobembo, retenue sur le reversement à l'agence.
  commission_amount INT NOT NULL DEFAULT 0,
  currency          VARCHAR(10) NOT NULL,
  fx_rate           DOUBLE,
  fx_rate_at        VARCHAR(32),
  -- INITIE | CONFIRME | ECHOUE | INDETERMINE | A_REMBOURSER | REMBOURSE
  status            VARCHAR(30) NOT NULL DEFAULT 'INITIE',
  raw_response      TEXT,
  polls             INT NOT NULL DEFAULT 0,
  last_polled_at    VARCHAR(32),
  created_at        VARCHAR(32) NOT NULL,
  resolved_at       VARCHAR(32),
  UNIQUE (idempotency_key),
  FOREIGN KEY (reservation_id) REFERENCES schedule_bookings(id) ON DELETE CASCADE,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- §14.3 Billet numérique. §16 : « Chaque QR code doit correspondre à un seul
-- billet » — d'où l'unicité sur la réservation et sur le code.
--
-- Le billet ne porte pas de siège : §14.3 ne l'y met pas, et la sélection de
-- place appartient à la phase 4 (§19.2). Une agence de phase 3 n'a pas de plan
-- de sièges, et son billet vaut pour N places sur un départ.
CREATE TABLE IF NOT EXISTS schedule_tickets (
  id             VARCHAR(32) PRIMARY KEY,
  reservation_id VARCHAR(32) NOT NULL UNIQUE,
  company_id     VARCHAR(32) NOT NULL,
  ticket_code    VARCHAR(20) NOT NULL UNIQUE,
  qr_signature   TEXT NOT NULL,
  seats          INT NOT NULL DEFAULT 1,
  -- VALIDE | UTILISE | ANNULE | EXPIRE  (§14.4 : à venir, utilisés, annulés, expirés)
  status         VARCHAR(30) NOT NULL DEFAULT 'VALIDE',
  paid_amount    INT NOT NULL,
  paid_currency  VARCHAR(10) NOT NULL,
  payment_id     VARCHAR(32),
  issued_at      VARCHAR(32) NOT NULL,
  used_at        VARCHAR(32),
  updated_at     VARCHAR(32) NOT NULL,
  FOREIGN KEY (reservation_id) REFERENCES schedule_bookings(id) ON DELETE CASCADE,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (payment_id) REFERENCES schedule_payments(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- §7 « Indicateurs Phase 1 » : nombre de recherches, trajets les plus
-- recherchés. Une ligne par recherche, sans identifiant de personne.
CREATE TABLE IF NOT EXISTS search_events (
  id               VARCHAR(32) PRIMARY KEY,
  origin_city      VARCHAR(80) NOT NULL,
  destination_city VARCHAR(80) NOT NULL,
  travel_date      VARCHAR(10) NOT NULL,
  results_count    INT NOT NULL DEFAULT 0,
  created_at       VARCHAR(32) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Migrations additives (colonnes ajoutées après la création initiale des
-- tables). Sur une base neuve, CREATE TABLE plus haut a déjà posé ces
-- colonnes : l'ALTER échoue avec "Duplicate column name" (1060), ignoré par
-- src/lib/db/index.ts au même titre que 1061 pour les index ci-dessous.
ALTER TABLE buses ADD COLUMN vehicle_type VARCHAR(30) NOT NULL DEFAULT 'BUS';
ALTER TABLE partner_applications ADD COLUMN application_type VARCHAR(30) NOT NULL DEFAULT 'COMPAGNIE';
ALTER TABLE companies ADD COLUMN kind VARCHAR(30) NOT NULL DEFAULT 'COMPAGNIE';

-- §4.4 « Fiche agence » : la vitrine publique d'une agence référencée. Ces
-- colonnes sont vides pour une compagnie créée avant la phase 1. La fiche
-- s'affiche alors avec ce qu'elle a, sans jamais inventer un contact.
ALTER TABLE companies ADD COLUMN slug VARCHAR(90);
ALTER TABLE companies ADD COLUMN description TEXT;
ALTER TABLE companies ADD COLUMN phone VARCHAR(20);
ALTER TABLE companies ADD COLUMN whatsapp VARCHAR(20);
ALTER TABLE companies ADD COLUMN email VARCHAR(160);
ALTER TABLE companies ADD COLUMN head_office_city VARCHAR(80);
ALTER TABLE companies ADD COLUMN address TEXT;
ALTER TABLE companies ADD COLUMN services TEXT;
-- §6 : « Le référencement des agences est gratuit. » Une agence est visible
-- dans l'annuaire dès sa création. Mobembo peut la retirer, pas l'inverse.
ALTER TABLE companies ADD COLUMN listed TINYINT NOT NULL DEFAULT 1;
ALTER TABLE companies ADD COLUMN profile_updated_at VARCHAR(32);

-- §29 : « Les fonctions affichées dépendent du rôle et de la phase activée pour
-- l'agence. » Les modules ouverts par l'équipe Mobembo, en JSON (voir
-- src/lib/domain/modules.ts). NULL signifie « jamais renseigné » et se
-- rattrape par les deux UPDATE de reprise plus bas.
ALTER TABLE companies ADD COLUMN modules TEXT;
-- Interrupteur du directeur : replier la vue sur l'essentiel sans rien perdre.
ALTER TABLE companies ADD COLUMN advanced_view TINYINT NOT NULL DEFAULT 1;

-- §17 : « 10 % sur les billets payés via Mobembo / IdoloPay. » Distinct de
-- commission_rate, qui porte la billetterie complète à 6-8 % (§2.10).
ALTER TABLE companies ADD COLUMN online_commission_rate DOUBLE NOT NULL DEFAULT 0.10;

-- §14.2 : une réservation payée en ligne n'a pas le même état qu'une
-- réservation à régler à l'agence. SUR_PLACE reste le défaut — la phase 2
-- continue de fonctionner à l'identique chez les agences sans phase 3.
ALTER TABLE schedule_bookings ADD COLUMN payment_status VARCHAR(30) NOT NULL DEFAULT 'SUR_PLACE';

-- Reprise de l'existant, idempotente : après le premier passage, plus aucune
-- ligne n'a modules IS NULL. Une compagnie qui possède déjà des véhicules
-- exploite la billetterie complète — lui retirer ses écrans à la migration
-- casserait son activité du jour. Les autres démarrent sur la phase 2.
UPDATE companies SET modules = '["RESERVATION","BILLETTERIE","ERP","CONTROLE"]'
 WHERE modules IS NULL AND EXISTS (SELECT 1 FROM buses b WHERE b.company_id = companies.id);
UPDATE companies SET modules = '["RESERVATION"]' WHERE modules IS NULL;
-- Renommage du module de phase 3 après relecture de la note : « billetterie »
-- couvrait à tort la planification et les plans de sièges, qui relèvent de
-- l'ERP (§19.2, §19.4). La phase 3 est le paiement et le billet numérique.
UPDATE companies SET modules = REPLACE(modules, '"BILLETTERIE"', '"PAIEMENT"')
 WHERE modules LIKE '%BILLETTERIE%';

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
-- Phase 1 & 2
CREATE UNIQUE INDEX idx_companies_slug ON companies(slug);
CREATE INDEX idx_schedules_axe ON schedules(origin_city, destination_city, status);
CREATE INDEX idx_schedules_company ON schedules(company_id, status);
CREATE INDEX idx_schedule_bookings_phone ON schedule_bookings(passenger_phone, status);
CREATE INDEX idx_schedule_bookings_jour ON schedule_bookings(schedule_id, travel_date, status);
CREATE INDEX idx_schedule_bookings_company ON schedule_bookings(company_id, departure_at);
CREATE INDEX idx_search_events_axe ON search_events(origin_city, destination_city, created_at);
-- Phase 3
CREATE INDEX idx_schedule_payments_reservation ON schedule_payments(reservation_id, status);
CREATE INDEX idx_schedule_payments_ref ON schedule_payments(provider_ref);
CREATE INDEX idx_schedule_payments_company ON schedule_payments(company_id, status, resolved_at);
CREATE INDEX idx_schedule_tickets_company ON schedule_tickets(company_id, status);
