import type { DbHandle } from "@/lib/db";
import { getDb } from "@/lib/db";
import { errors } from "@/lib/core/errors";
import type {
  BusCategory,
  Channel,
  CompanyPolicy,
  DepartureMode,
  PaymentStatus,
  Role,
  TicketStatus,
  TripStatus,
} from "./types";
import { DEFAULT_POLICY } from "./types";

export interface CompanyRow {
  id: string;
  name: string;
  logo: string | null;
  status: string;
  commission_rate: number;
  currency_rate_usd_cdf: number;
  currency_rate_at: string | null;
  qr_secret: string;
  qr_secret_previous: string | null;
  qr_secret_rotated_at: string | null;
  policy_json: string;
  created_at: string;
}

export interface AgencyRow {
  id: string;
  company_id: string;
  name: string;
  city: string;
  address: string | null;
  gps: string | null;
  opening_hours: string | null;
  status: string;
  ticket_sequence: number;
  created_at: string;
}

export interface UserRow {
  id: string;
  phone: string;
  name: string;
  password_hash: string | null;
  status: string;
  locale: string;
  created_at: string;
}

export interface UserRoleRow {
  id: string;
  user_id: string;
  role: Role;
  company_id: string | null;
  agency_id: string | null;
  created_at: string;
}

export interface SeatMapRow {
  id: string;
  company_id: string | null;
  name: string;
  rows: number;
  layout_json: string;
  disabled_seats: string;
  seat_count: number;
  created_at: string;
}

export interface BusRow {
  id: string;
  company_id: string;
  plate_number: string;
  seat_map_id: string;
  category: BusCategory;
  status: string;
  created_at: string;
}

export interface RouteRow {
  id: string;
  company_id: string;
  origin_city: string;
  destination_city: string;
  distance_km: number | null;
  duration_est_min: number | null;
  created_at: string;
}

export interface TripRow {
  id: string;
  company_id: string;
  route_id: string;
  bus_id: string;
  origin_agency_id: string | null;
  departure_datetime: string;
  departure_mode: DepartureMode;
  status: TripStatus;
  departed_at: string | null;
  manifest_closed_at: string | null;
  created_at: string;
}

export interface TripPriceRow {
  id: string;
  trip_id: string;
  category: BusCategory;
  price_usd: number;
  price_cdf: number;
}

export interface BookingRow {
  id: string;
  trip_id: string;
  buyer_phone: string;
  buyer_name: string | null;
  channel: Channel;
  agency_id: string | null;
  sold_by_user_id: string | null;
  cash_session_id: string | null;
  total_amount: number;
  currency: string;
  status: string;
  credit_applied: number;
  created_at: string;
  confirmed_at: string | null;
}

export interface TicketRow {
  id: string;
  booking_id: string;
  trip_seat_id: string;
  trip_id: string;
  passenger_name: string;
  passenger_phone: string;
  ticket_code: string;
  sequence_number: number | null;
  agency_id: string | null;
  qr_signature: string;
  status: TicketStatus;
  price_amount: number;
  price_currency: string;
  parent_ticket_id: string | null;
  resold_count: number;
  created_at: string;
  updated_at: string;
}

export interface PaymentRow {
  id: string;
  booking_id: string;
  provider: string;
  provider_ref: string | null;
  idempotency_key: string;
  payer_phone: string;
  amount: number;
  currency: string;
  fx_rate: number | null;
  fx_rate_at: string | null;
  status: PaymentStatus;
  raw_response: string | null;
  polls: number;
  last_polled_at: string | null;
  created_at: string;
  resolved_at: string | null;
}

export interface CashSessionRow {
  id: string;
  agency_id: string;
  user_id: string;
  opened_at: string;
  opening_float: number;
  currency: string;
  closed_at: string | null;
  counted_amount: number | null;
  variance: number | null;
  device_id: string | null;
  created_at: string;
}

export interface ResaleListingRow {
  id: string;
  ticket_id: string;
  trip_id: string;
  seller_phone: string;
  price_amount: number;
  price_currency: string;
  listed_at: string;
  expires_at: string;
  status: string;
  sold_to_ticket_id: string | null;
  fee_amount: number | null;
  sold_at: string | null;
}

export interface CreditRow {
  id: string;
  passenger_phone: string;
  company_id: string;
  amount: number;
  currency: string;
  origin_ticket_id: string | null;
  issued_at: string;
  expires_at: string;
  consumed_booking_id: string | null;
  status: string;
  created_at: string;
}

// --- Accès -----------------------------------------------------------------

export async function getCompany(id: string, db: DbHandle = getDb()): Promise<CompanyRow> {
  const row = (await db.prepare(`SELECT * FROM companies WHERE id = ?`).get(id)) as
    | CompanyRow
    | undefined;
  if (!row) throw errors.notFound("Compagnie");
  return row;
}

export function companyPolicy(company: CompanyRow): CompanyPolicy {
  try {
    return { ...DEFAULT_POLICY, ...(JSON.parse(company.policy_json) as Partial<CompanyPolicy>) };
  } catch {
    return DEFAULT_POLICY;
  }
}

export async function getAgency(id: string, db: DbHandle = getDb()): Promise<AgencyRow> {
  const row = (await db.prepare(`SELECT * FROM agencies WHERE id = ?`).get(id)) as
    | AgencyRow
    | undefined;
  if (!row) throw errors.notFound("Agence");
  return row;
}

export async function getTrip(id: string, db: DbHandle = getDb()): Promise<TripRow> {
  const row = (await db.prepare(`SELECT * FROM trips WHERE id = ?`).get(id)) as TripRow | undefined;
  if (!row) throw errors.notFound("Trajet");
  return row;
}

export async function getBus(id: string, db: DbHandle = getDb()): Promise<BusRow> {
  const row = (await db.prepare(`SELECT * FROM buses WHERE id = ?`).get(id)) as BusRow | undefined;
  if (!row) throw errors.notFound("Bus");
  return row;
}

export async function getRoute(id: string, db: DbHandle = getDb()): Promise<RouteRow> {
  const row = (await db.prepare(`SELECT * FROM routes WHERE id = ?`).get(id)) as
    | RouteRow
    | undefined;
  if (!row) throw errors.notFound("Ligne");
  return row;
}

export async function getSeatMap(id: string, db: DbHandle = getDb()): Promise<SeatMapRow> {
  const row = (await db
    .prepare(`SELECT *, row_count AS \`rows\` FROM seat_maps WHERE id = ?`)
    .get(id)) as SeatMapRow | undefined;
  if (!row) throw errors.notFound("Plan de sièges");
  return row;
}

export async function getTicket(id: string, db: DbHandle = getDb()): Promise<TicketRow> {
  const row = (await db.prepare(`SELECT * FROM tickets WHERE id = ?`).get(id)) as
    | TicketRow
    | undefined;
  if (!row) throw errors.notFound("Billet");
  return row;
}

export async function getTicketByCode(
  code: string,
  db: DbHandle = getDb(),
): Promise<TicketRow | undefined> {
  return (await db.prepare(`SELECT * FROM tickets WHERE ticket_code = ?`).get(code.toUpperCase())) as
    | TicketRow
    | undefined;
}

export async function getBooking(id: string, db: DbHandle = getDb()): Promise<BookingRow> {
  const row = (await db.prepare(`SELECT * FROM bookings WHERE id = ?`).get(id)) as
    | BookingRow
    | undefined;
  if (!row) throw errors.notFound("Réservation");
  return row;
}

export async function tripPrice(
  tripId: string,
  category: BusCategory,
  db: DbHandle = getDb(),
): Promise<TripPriceRow> {
  const row = (await db
    .prepare(`SELECT * FROM trip_prices WHERE trip_id = ? AND category = ?`)
    .get(tripId, category)) as TripPriceRow | undefined;
  if (!row) throw errors.notFound(`Tarif ${category} du trajet`);
  return row;
}

export interface TripDetail extends TripRow {
  route: RouteRow;
  bus: BusRow;
  company: CompanyRow;
  agency: AgencyRow | null;
  prices: TripPriceRow[];
}

export async function tripDetail(id: string, db: DbHandle = getDb()): Promise<TripDetail> {
  const trip = await getTrip(id, db);
  const [route, bus, company, agency, prices] = await Promise.all([
    getRoute(trip.route_id, db),
    getBus(trip.bus_id, db),
    getCompany(trip.company_id, db),
    trip.origin_agency_id ? getAgency(trip.origin_agency_id, db) : Promise.resolve(null),
    db.prepare<TripPriceRow>(`SELECT * FROM trip_prices WHERE trip_id = ?`).all(id),
  ]);
  return { ...trip, route, bus, company, agency, prices };
}

export async function rolesOf(userId: string, db: DbHandle = getDb()): Promise<UserRoleRow[]> {
  return db.prepare<UserRoleRow>(`SELECT * FROM user_roles WHERE user_id = ? ORDER BY role`).all(userId);
}

/** Vue minimale d'un siège de trajet, suffisante pour émettre un billet. */
export interface TripSeatLike {
  id: string;
  seat_number: string;
}
