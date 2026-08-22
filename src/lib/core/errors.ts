/**
 * Erreur métier : porteuse d'un code stable, destinée à être rendue telle
 * quelle au guichetier ou au passager. Tout ce qui n'est pas une DomainError
 * est un bug, et se journalise comme tel.
 */
export class DomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export const errors = {
  unauthorized: () => new DomainError("NON_AUTHENTIFIE", "Session absente ou expirée.", 401),
  forbidden: (what = "Action non autorisée pour ce rôle.") =>
    new DomainError("INTERDIT", what, 403),
  notFound: (what: string) => new DomainError("INTROUVABLE", `${what} introuvable.`, 404),
  conflict: (code: string, message: string, details?: Record<string, unknown>) =>
    new DomainError(code, message, 409, details),
  invalid: (message: string, details?: Record<string, unknown>) =>
    new DomainError("REQUETE_INVALIDE", message, 400, details),
};
