import { freshness } from "@/lib/core/time";
import { formatMoney } from "@/lib/core/money";
import { directionsLink, whatsappLink } from "@/lib/core/links";
import type { BookingMode } from "@/lib/domain/offers";

/**
 * Briques partagées par la recherche, la fiche agence et la fiche horaire.
 *
 * Elles portent une exigence de la phase 1 que le reste du produit n'avait pas
 * à tenir : une information publiée par une agence est datée, et son mode de
 * réservation est dit avant que le voyageur ne clique. Un horaire simplement
 * référencé ne doit jamais ressembler à un départ réservable en ligne.
 */

/** §6 : « Les informations visibles doivent afficher leur dernière date de mise à jour. » */
export function MiseAJour({ iso, className = "" }: { iso: string; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs text-texte-doux ${className}`}
      title={new Date(iso).toLocaleString("fr-CD", { timeZone: "Africa/Kinshasa" })}
    >
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
      Mis à jour {freshness(iso)}
    </span>
  );
}

const MODE_TEXTE: Record<BookingMode, { label: string; tone: string }> = {
  SIEGE: {
    label: "Siège au choix · paiement en ligne",
    tone: "border-succes/30 bg-succes-doux text-succes",
  },
  PLACES: {
    label: "Réservation en ligne",
    tone: "border-accent/30 bg-accent-doux text-accent",
  },
  CONTACT: {
    label: "Réservation auprès de l’agence",
    tone: "border-bordure bg-surface-alt text-texte-doux",
  },
};

export function ModeReservation({ mode }: { mode: BookingMode }) {
  const { label, tone } = MODE_TEXTE[mode];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold ${tone}`}>
      {mode === "CONTACT" ? <PhoneGlyph /> : <BoltGlyph />}
      {label}
    </span>
  );
}

/**
 * Le prix d'un horaire de phase 1 est celui que l'agence annonce : il n'a pas
 * été encaissé par Mobembo et peut avoir changé. Le dire est plus utile que de
 * l'afficher comme un tarif garanti.
 */
export function PrixOffre({
  usd,
  cdf,
  indicatif,
  taille = "normal",
}: {
  usd: number | null;
  cdf: number | null;
  indicatif: boolean;
  taille?: "normal" | "grand";
}) {
  if (usd === null && cdf === null) {
    return <p className="text-sm text-texte-doux">Prix à confirmer avec l’agence</p>;
  }
  return (
    <div>
      {indicatif && <p className="text-[11px] font-medium text-texte-doux">Prix annoncé</p>}
      <p className={`font-bold tabular-nums text-navy ${taille === "grand" ? "text-3xl" : "text-xl"}`}>
        {usd !== null ? formatMoney(usd, "USD") : formatMoney(cdf!, "CDF")}
      </p>
      {usd !== null && cdf !== null && (
        <p className="text-xs tabular-nums text-texte-doux">{formatMoney(cdf, "CDF")}</p>
      )}
    </div>
  );
}

/**
 * §4.5 : « appeler l'agence ; contacter l'agence sur WhatsApp ; obtenir
 * l'itinéraire vers le point de départ. » Un bouton n'apparaît que si
 * l'information existe — une agence sans WhatsApp n'affiche pas un bouton mort.
 */
export function ContactAgence({
  telephone,
  whatsapp,
  messageWhatsapp,
  lieu,
  gps,
  compact = false,
}: {
  telephone?: string | null;
  whatsapp?: string | null;
  messageWhatsapp?: string;
  lieu?: string | null;
  gps?: string | null;
  compact?: boolean;
}) {
  const itineraire = gps || lieu;
  if (!telephone && !whatsapp && !itineraire) return null;

  const base = compact
    ? "inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] border px-3 text-sm font-semibold transition"
    : "inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-[10px] border px-4 text-sm font-bold transition";

  return (
    <div className={compact ? "flex flex-wrap gap-2" : "flex flex-col gap-2 sm:flex-row"}>
      {telephone && (
        <a href={`tel:${telephone}`} className={`${base} border-navy bg-navy text-white hover:bg-navy-profond`}>
          <PhoneGlyph />
          Appeler
        </a>
      )}
      {whatsapp && (
        <a
          href={whatsappLink(whatsapp, messageWhatsapp)}
          target="_blank"
          rel="noopener noreferrer"
          className={`${base} border-bordure bg-surface text-navy hover:border-accent hover:text-accent`}
        >
          <WhatsappGlyph />
          WhatsApp
        </a>
      )}
      {itineraire && (
        <a
          href={directionsLink(itineraire)}
          target="_blank"
          rel="noopener noreferrer"
          className={`${base} border-bordure bg-surface text-navy hover:border-accent hover:text-accent`}
        >
          <PinGlyph />
          Itinéraire
        </a>
      )}
    </div>
  );
}

/** Vignette d'agence : logo si l'agence en a fourni un, initiales sinon. */
export function LogoAgence({
  nom,
  logo,
  taille = 44,
}: {
  nom: string;
  logo?: string | null;
  taille?: number;
}) {
  const initiales = nom
    .split(/\s+/)
    .slice(0, 2)
    .map((mot) => mot[0])
    .join("")
    .toUpperCase();

  return (
    <span
      className="grid shrink-0 place-items-center overflow-hidden rounded-[10px] border border-bordure bg-surface-alt font-heading font-bold text-navy"
      style={{ width: taille, height: taille, fontSize: taille * 0.36 }}
      aria-hidden
    >
      {logo ? (
        // Logos fournis par les agences : hôtes inconnus à la compilation, donc
        // hors du pipeline next/image, qui exige une liste de domaines.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="" className="h-full w-full object-contain" loading="lazy" />
      ) : (
        initiales
      )}
    </span>
  );
}

function PhoneGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M6 3h3l2 5-2.5 1.5a12 12 0 0 0 5 5L15 12l5 2v3a2 2 0 0 1-2.2 2A16 16 0 0 1 4 5.2 2 2 0 0 1 6 3Z" />
    </svg>
  );
}

function WhatsappGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden>
      <path d="M12 2a10 10 0 0 0-8.5 15.2L2 22l4.9-1.4A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-2.9.8.8-2.8-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.4-.7-1.7-.8s-.4-.1-.5.1-.6.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.6-1.2a.5.5 0 0 0 0-.5c0-.1-.5-1.3-.7-1.8s-.4-.4-.5-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4 8.6 8.6 0 0 0 1.5.5 3.6 3.6 0 0 0 1.6.1 2.6 2.6 0 0 0 1.7-1.2 2.1 2.1 0 0 0 .1-1.2c0-.1-.2-.2-.4-.3Z" />
    </svg>
  );
}

function PinGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

function BoltGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />
    </svg>
  );
}
