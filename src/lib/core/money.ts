export type Currency = "USD" | "CDF";

/**
 * Les montants circulent en entiers (centimes USD, centimes CDF). Aucun
 * flottant ne touche une recette : §5.1 exige un écart de caisse exact.
 */
export function toMinor(amount: number): number {
  return Math.round(amount * 100);
}

export function fromMinor(minor: number): number {
  return minor / 100;
}

export function formatMoney(minor: number, currency: Currency): string {
  const value = fromMinor(minor);
  if (currency === "CDF") {
    return `${new Intl.NumberFormat("fr-CD", { maximumFractionDigits: 0 }).format(value)} FC`;
  }
  return `${new Intl.NumberFormat("fr-CD", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} $`;
}

/**
 * §3.2 : « Chaque transaction enregistre montant, devise, taux appliqué et
 * horodatage du taux. » La conversion n'est jamais implicite.
 */
export function convert(
  minor: number,
  from: Currency,
  to: Currency,
  usdToCdf: number,
): number {
  if (from === to) return minor;
  if (from === "USD" && to === "CDF") return Math.round(minor * usdToCdf);
  return Math.round(minor / usdToCdf);
}

/** Pourcentage sur un montant entier, arrondi au centime supérieur. */
export function percentOf(minor: number, rate: number): number {
  return Math.ceil(minor * rate);
}
