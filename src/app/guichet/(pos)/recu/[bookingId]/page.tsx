import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import {
  companyPolicy,
  getAgency,
  getBooking,
  getCompany,
  tripDetail,
  type TicketRow,
} from "@/lib/domain/repo";
import { formatDateTime, formatTime } from "@/lib/core/time";
import { formatMoney, type Currency } from "@/lib/core/money";
import { PROVIDER_LABELS, type PaymentProviderId } from "@/lib/domain/types";
import { QrCode } from "@/components/qr";
import { BoutonImpression } from "./impression";

export const dynamic = "force-dynamic";

interface LigneBillet extends TicketRow {
  seat_number: string;
}

/**
 * Reçu imprimable d'une vente au guichet (§2.4.5).
 *
 * Le passager qui achète à l'agence est très souvent celui qui n'a pas de
 * smartphone — c'est précisément pour cela qu'il s'est déplacé. Le SMS ne lui
 * suffit pas : il lui faut le QR sur papier, sinon le contrôleur doit ressaisir
 * son code à la main à chaque embarquement.
 *
 * Il n'y a pas de souche pour l'agence : le registre, c'est le système (§1.2).
 * Imprimer un double à archiver recréerait le carnet papier que le projet
 * supprime.
 */
export default async function RecuGuichet(props: PageProps<"/guichet/recu/[bookingId]">) {
  const { bookingId } = await props.params;
  const parametres = await props.searchParams;
  const session = await currentSession();

  if (
    !session ||
    !["GUICHETIER", "GERANT_AGENCE", "ADMIN_COMPAGNIE", "SUPER_ADMIN"].includes(
      session.activeRole,
    )
  ) {
    redirect("/guichet/connexion");
  }

  const db = getDb();
  let booking;
  try {
    booking = await getBooking(bookingId, db);
  } catch {
    notFound();
  }

  const trip = await tripDetail(booking.trip_id, db);
  // Un reçu porte un QR d'embarquement : il ne sort pas de la compagnie.
  if (session.activeRole !== "SUPER_ADMIN" && trip.company_id !== session.companyId) {
    notFound();
  }

  const company = await getCompany(trip.company_id, db);
  const policy = companyPolicy(company);
  const agency = booking.agency_id ? await getAgency(booking.agency_id, db) : trip.agency;

  const tous = await db
    .prepare<LigneBillet>(
      `SELECT t.*, s.seat_number FROM tickets t
         JOIN trip_seats s ON s.id = t.trip_seat_id
        WHERE t.booking_id = ? ORDER BY s.seat_number`,
    )
    .all(bookingId);

  // `?billet=` permet de réimprimer un seul billet d'une vente de groupe,
  // quand un passager perd le sien.
  const cible = typeof parametres.billet === "string" ? parametres.billet : null;
  const billets = cible ? tous.filter((b) => b.id === cible) : tous;

  if (billets.length === 0) notFound();

  const vendeur = booking.sold_by_user_id
    ? await db.prepare<{ name: string }>(`SELECT name FROM users WHERE id = ?`).get(booking.sold_by_user_id)
    : undefined;

  const paiement = await db
    .prepare<{ provider: string }>(
      `SELECT provider FROM payments WHERE booking_id = ? AND status = 'CONFIRME'
        ORDER BY created_at LIMIT 1`,
    )
    .get(bookingId);

  return (
    <div className="feuille-impression space-y-4">
      <div className="sans-impression flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href={`/guichet/vente/${booking.trip_id}`}
            className="text-sm text-accent hover:underline"
          >
            ← Retour à la vente
          </Link>
          <h1 className="mt-1.5 text-xl font-semibold tracking-tight">
            Reçu — {billets.length} billet{billets.length > 1 ? "s" : ""}
          </h1>
          <p className="text-sm text-texte-doux">
            Remettez-le au passager. Le QR imprimé se scanne comme celui du téléphone.
          </p>
        </div>
        <BoutonImpression automatique={parametres.auto === "1"} />
      </div>

      <div className="space-y-4">
        {billets.map((billet) => (
          <Billet
            key={billet.id}
            billet={billet}
            compagnie={company.name}
            agence={agency?.name ?? "—"}
            ligne={`${trip.route.origin_city} → ${trip.route.destination_city}`}
            depart={trip.departure_datetime}
            mode={trip.departure_mode}
            plaque={trip.bus.plate_number}
            categorie={trip.bus.category}
            acheteur={booking.buyer_phone}
            vendeur={vendeur?.name ?? "—"}
            moyen={paiement?.provider ?? "ESPECES"}
            delaiTransfert={policy.transferDeadlineHours}
            delaiRevente={policy.resaleDeadlineHours}
          />
        ))}
      </div>
    </div>
  );
}

function Billet({
  billet,
  compagnie,
  agence,
  ligne,
  depart,
  mode,
  plaque,
  categorie,
  acheteur,
  vendeur,
  moyen,
  delaiTransfert,
  delaiRevente,
}: {
  billet: LigneBillet;
  compagnie: string;
  agence: string;
  ligne: string;
  depart: string;
  mode: string;
  plaque: string;
  categorie: string;
  acheteur: string;
  vendeur: string;
  moyen: string;
  delaiTransfert: number;
  delaiRevente: number;
}) {
  // Réimprimer un billet annulé ou revendu remettrait en circulation un QR que
  // le contrôleur refusera : mieux vaut le dire ici que sur le quai.
  const valide = billet.status === "EMIS" || billet.status === "EN_REVENTE";

  return (
    <article className="billet-imprimable mx-auto w-full max-w-[76mm] rounded-lg border border-bordure bg-surface p-3 text-[11px] leading-snug">
      <header className="border-b border-dashed border-bordure pb-2 text-center">
        <p className="text-sm font-bold uppercase tracking-wide">{compagnie}</p>
        <p className="text-[10px] text-texte-doux">{agence}</p>
      </header>

      {!valide && (
        <p className="my-2 border border-alerte px-2 py-1.5 text-center text-[11px] font-bold uppercase text-alerte">
          Billet {billet.status.replace(/_/g, " ").toLowerCase()} — ne pas remettre
        </p>
      )}

      <div className="border-b border-dashed border-bordure py-2 text-center">
        <p className="text-[13px] font-bold">{ligne}</p>
        <p className="mt-0.5 text-[11px]">
          {mode === "HORAIRE_FIXE" ? formatDateTime(depart) : "Départ au remplissage"}
        </p>
      </div>

      <div className="flex items-stretch justify-between gap-2 border-b border-dashed border-bordure py-2">
        <div className="flex-1">
          <Champ terme="Passager" valeur={billet.passenger_name} />
          <Champ terme="Téléphone" valeur={billet.passenger_phone} />
          <Champ terme="Bus" valeur={`${plaque} · ${categorie}`} />
        </div>
        <div className="flex w-[22mm] flex-col items-center justify-center border-l border-dashed border-bordure pl-2">
          <span className="text-[9px] uppercase text-texte-doux">Siège</span>
          <span className="text-2xl font-bold tabular-nums">{billet.seat_number}</span>
        </div>
      </div>

      {valide ? (
        <div className="flex flex-col items-center border-b border-dashed border-bordure py-2">
          <QrCode payload={billet.qr_signature} size={132} />
          <p className="mt-1.5 font-mono text-base font-bold tracking-[0.15em]">
            {billet.ticket_code}
          </p>
          <p className="mt-0.5 text-center text-[9px] text-texte-doux">
            Présentez ce code à l&apos;embarquement.
          </p>
        </div>
      ) : (
        <div className="border-b border-dashed border-bordure py-3 text-center">
          <p className="font-mono text-base font-bold tracking-[0.15em]">{billet.ticket_code}</p>
        </div>
      )}

      <div className="border-b border-dashed border-bordure py-2">
        <div className="flex items-baseline justify-between">
          <span className="text-[11px] font-semibold uppercase">Payé</span>
          <span className="text-[13px] font-bold tabular-nums">
            {formatMoney(billet.price_amount, billet.price_currency as Currency)}
          </span>
        </div>
        <Champ
          terme="Moyen"
          valeur={PROVIDER_LABELS[moyen as PaymentProviderId] ?? moyen}
        />
        {billet.sequence_number !== null && (
          <Champ terme="N° billet" valeur={`#${billet.sequence_number}`} />
        )}
        <Champ terme="Guichetier" valeur={vendeur} />
        <Champ terme="Émis le" valeur={`${formatDateTime(billet.created_at)}`} />
      </div>

      <footer className="pt-2 text-[9px] leading-relaxed text-texte-doux">
        <p>
          Empêchement ? Transférez ce billet à un proche gratuitement jusqu&apos;à{" "}
          {delaiTransfert} h avant le départ, ou remettez-le en vente jusqu&apos;à {delaiRevente} h
          avant. Rendez-vous sur Mobembo avec le numéro {acheteur}.
        </p>
        <p className="mt-1 text-center font-medium">
          Conservez ce reçu — il vaut billet.
        </p>
      </footer>
    </article>
  );
}

function Champ({ terme, valeur }: { terme: string; valeur: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-[10px] text-texte-doux">{terme}</span>
      <span className="text-right text-[10px] font-medium">{valeur}</span>
    </div>
  );
}

export { formatTime };
