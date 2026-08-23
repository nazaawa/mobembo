import Link from "next/link";
import { Card, Badge, Table } from "@/components/ui";

export const metadata = { title: "Mobembo — API" };

/**
 * §4.2 Livrables : « API documentée ». La documentation vit à côté du code
 * qu'elle décrit — une spécification dans un fichier séparé diverge en trois
 * semaines.
 */
interface Route {
  methode: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  chemin: string;
  role: string;
  description: string;
  reference: string;
}

const GROUPES: Array<{ titre: string; sous: string; routes: Route[] }> = [
  {
    titre: "Authentification",
    sous: "Staff par mot de passe, passagers par OTP SMS (§3.3).",
    routes: [
      {
        methode: "POST",
        chemin: "/api/auth/connexion",
        role: "public",
        description: "Connexion staff. Corps : { phone, password, role?, agencyId? }.",
        reference: "§1.5",
      },
      {
        methode: "POST",
        chemin: "/api/auth/otp/demande",
        role: "public",
        description: "Envoie un code SMS. Corps : { phone }.",
        reference: "§2.5.4",
      },
      {
        methode: "POST",
        chemin: "/api/auth/otp/verification",
        role: "public",
        description: "Valide le code et crée le compte au premier achat. { phone, code, name? }.",
        reference: "§2.5.4",
      },
      {
        methode: "POST",
        chemin: "/api/auth/role",
        role: "authentifié",
        description: "Bascule de casquette. Tracée au journal d'audit.",
        reference: "§1.5",
      },
      { methode: "GET", chemin: "/api/auth/moi", role: "public", description: "Session courante.", reference: "—" },
      { methode: "POST", chemin: "/api/auth/deconnexion", role: "authentifié", description: "Révoque la session.", reference: "—" },
    ],
  },
  {
    titre: "Recherche et réservation passager",
    sous: "Tunnel §2.5 : recherche → maintien 7 min → identité → paiement.",
    routes: [
      {
        methode: "GET",
        chemin: "/api/recherche?origine=&destination=&date=",
        role: "public",
        description: "Départs à horaire fixe, places en ligne, sièges remis en vente.",
        reference: "§2.5.1-2",
      },
      { methode: "GET", chemin: "/api/villes", role: "public", description: "Villes desservies.", reference: "—" },
      {
        methode: "GET",
        chemin: "/api/trajets/{tripId}/sieges",
        role: "public",
        description: "Plan de sièges avec états temps réel et canal propriétaire.",
        reference: "§2.4.2",
      },
      {
        methode: "POST",
        chemin: "/api/reservations/maintien",
        role: "public",
        description: "Verrouille des sièges 7 minutes. { tripId, sieges[], holdId? }.",
        reference: "§2.5.3",
      },
      {
        methode: "DELETE",
        chemin: "/api/reservations/maintien",
        role: "public",
        description: "Libère un maintien avant expiration.",
        reference: "§2.5.3",
      },
      {
        methode: "POST",
        chemin: "/api/reservations",
        role: "public",
        description: "Crée la réservation. Plusieurs sièges, un seul paiement.",
        reference: "§2.5.4",
      },
      {
        methode: "GET",
        chemin: "/api/reservations/{bookingId}",
        role: "public",
        description: "Réservation, billets et paiements associés.",
        reference: "—",
      },
    ],
  },
  {
    titre: "Paiements Mobile Money",
    sous: "Idempotence obligatoire, webhook principal, polling de secours (§3.2).",
    routes: [
      {
        methode: "POST",
        chemin: "/api/paiements",
        role: "public",
        description:
          "Initie un débit. { reservationId, operateur, telephone, cleIdempotence }. Un rejeu de clé ne débite jamais deux fois.",
        reference: "§3.2",
      },
      {
        methode: "GET",
        chemin: "/api/paiements/{paymentId}/statut",
        role: "public",
        description:
          "Interroge l'opérateur. Après 5 min sans réponse : INDETERMINE, siège maintenu verrouillé, ticket support ouvert.",
        reference: "§3.2",
      },
      {
        methode: "POST",
        chemin: "/api/paiements/{paymentId}/arbitrage",
        role: "ADMIN_COMPAGNIE",
        description: "Arbitrage humain d'un paiement indéterminé. { decision, note }.",
        reference: "§3.2",
      },
      {
        methode: "POST",
        chemin: "/api/webhooks/paiements",
        role: "opérateur signé",
        description:
          "Confirmation opérateur. Signature HMAC vérifiée sur le corps brut avant toute lecture métier.",
        reference: "§3.2",
      },
    ],
  },
  {
    titre: "Billets, revente et transfert",
    sous: "Le gradient d'incitation §2.9 et la revente atomique §2.6.",
    routes: [
      {
        methode: "GET",
        chemin: "/api/billets/{ticketId}",
        role: "public",
        description: "Billet, trajet, grille de renoncement et éligibilité à la revente.",
        reference: "§2.9",
      },
      { methode: "GET", chemin: "/api/billets/mes-billets", role: "PASSAGER", description: "Billets et avoirs du numéro connecté.", reference: "—" },
      {
        methode: "POST",
        chemin: "/api/billets/{ticketId}/revente",
        role: "PASSAGER",
        description: "Remet en vente au prix d'achat. Le siège reste VENDU.",
        reference: "§2.6",
      },
      {
        methode: "DELETE",
        chemin: "/api/billets/{ticketId}/revente",
        role: "PASSAGER",
        description: "Retire l'annonce ; le billet redevient EMIS.",
        reference: "§2.6",
      },
      {
        methode: "POST",
        chemin: "/api/billets/{ticketId}/transfert",
        role: "PASSAGER",
        description: "Transfert gratuit à un proche. { nom, telephone }.",
        reference: "§2.6",
      },
      {
        methode: "POST",
        chemin: "/api/billets/{ticketId}/renoncement",
        role: "PASSAGER",
        description: "Report (100 % en avoir) ou annulation tardive (50 %).",
        reference: "§2.9",
      },
      {
        methode: "POST",
        chemin: "/api/billets/{ticketId}/responsabilite",
        role: "GERANT_AGENCE",
        description: "Applique la grille de responsabilité : remboursement, avoir, imputation.",
        reference: "§2.10",
      },
    ],
  },
  {
    titre: "Guichet (POS)",
    sous: "Le cœur du système. Session de caisse obligatoire, mode dégradé (§2.4).",
    routes: [
      { methode: "GET", chemin: "/api/guichet/trajets", role: "GUICHETIER", description: "Départs de l'agence, journée en cours.", reference: "§2.4.1" },
      { methode: "GET", chemin: "/api/guichet/caisse", role: "GUICHETIER", description: "Session ouverte et son état.", reference: "§2.4" },
      { methode: "POST", chemin: "/api/guichet/caisse", role: "GUICHETIER", description: "Ouverture : { fondInitial, devise }.", reference: "§2.4" },
      {
        methode: "POST",
        chemin: "/api/guichet/caisse/{sessionId}/fermeture",
        role: "GUICHETIER",
        description: "Fermeture : { montantCompte }. Renvoie l'écart. Non rejouable.",
        reference: "§2.4",
      },
      {
        methode: "POST",
        chemin: "/api/guichet/vente",
        role: "GUICHETIER",
        description:
          "Vente espèces atomique : verrou, billet, QR, SMS, mouvement de caisse. `clientOpId` rend l'appel idempotent.",
        reference: "§2.4",
      },
      {
        methode: "POST",
        chemin: "/api/guichet/synchronisation",
        role: "GUICHETIER",
        description:
          "Vide la file hors-ligne. Chaque vente est idempotente ; un refus n'interrompt pas le lot.",
        reference: "§2.4",
      },
    ],
  },
  {
    titre: "Embarquement",
    sous: "Manifeste téléchargeable, scan hors-ligne, anti-rejeu (§2.7).",
    routes: [
      {
        methode: "GET",
        chemin: "/api/trajets/{tripId}/manifeste",
        role: "CONTROLEUR",
        description:
          "Manifeste complet + clé HMAC de la compagnie, pour valider les QR sans réseau.",
        reference: "§2.7",
      },
      { methode: "POST", chemin: "/api/controle/scan", role: "CONTROLEUR", description: "Scan en ligne. { tripId, qr }.", reference: "§2.7" },
      {
        methode: "POST",
        chemin: "/api/controle/synchronisation",
        role: "CONTROLEUR",
        description: "Remonte les scans hors-ligne. Idempotent par clientOpId.",
        reference: "§2.7",
      },
      {
        methode: "POST",
        chemin: "/api/trajets/{tripId}/depart",
        role: "CONTROLEUR",
        description: "Enregistre le départ effectif — c'est lui qui fait foi, pas l'horaire.",
        reference: "§2.9",
      },
      {
        methode: "POST",
        chemin: "/api/trajets/{tripId}/cloture",
        role: "CONTROLEUR",
        description: "Clôture le manifeste : no-shows constatés, remplissage réel figé.",
        reference: "§2.7",
      },
    ],
  },
  {
    titre: "Back-office",
    sous: "Référentiel, planification, rapports, reversements (§2.1, §2.2, §2.11, §2.10).",
    routes: [
      { methode: "GET", chemin: "/api/backoffice/rapports", role: "ADMIN_COMPAGNIE", description: "Recettes, écarts de caisse, remplissage, revente, indicateurs §5.1.", reference: "§2.11" },
      { methode: "GET", chemin: "/api/backoffice/audit", role: "ADMIN_COMPAGNIE", description: "Journal filtrable. `format=csv` pour l'export.", reference: "§2.11" },
      { methode: "GET", chemin: "/api/backoffice/alertes", role: "GERANT_AGENCE", description: "Alertes ouvertes et tickets support.", reference: "§2.11" },
      { methode: "POST", chemin: "/api/backoffice/alertes", role: "GERANT_AGENCE", description: "Acquitte une alerte.", reference: "§2.11" },
      { methode: "GET", chemin: "/api/backoffice/reversements", role: "ADMIN_COMPAGNIE", description: "Historique et détail ligne à ligne.", reference: "§2.10" },
      { methode: "POST", chemin: "/api/backoffice/reversements", role: "ADMIN_COMPAGNIE", description: "{ action: CALCULER | MARQUER_PAYE }.", reference: "§2.10" },
      { methode: "GET", chemin: "/api/backoffice/reconciliation?jour=", role: "ADMIN_COMPAGNIE", description: "Relevé opérateur contre transactions internes.", reference: "§3.2" },
      { methode: "GET", chemin: "/api/backoffice/indetermines", role: "ADMIN_COMPAGNIE", description: "File d'arbitrage et taux vs cible de 1 %.", reference: "§3.2" },
      { methode: "GET", chemin: "/api/backoffice/parametres", role: "ADMIN_COMPAGNIE", description: "Grille de renoncement, commission, taux de change.", reference: "§2.9" },
      { methode: "PUT", chemin: "/api/backoffice/parametres", role: "ADMIN_COMPAGNIE", description: "Met à jour la grille. Journalisé avant/après.", reference: "§2.9" },
      { methode: "GET", chemin: "/api/backoffice/plans", role: "ADMIN_COMPAGNIE", description: "Plans de sièges et dispositions proposées.", reference: "§2.1" },
      { methode: "POST", chemin: "/api/backoffice/plans", role: "ADMIN_COMPAGNIE", description: "Crée un gabarit. { nom, rangees, disposition, siegesDesactives }.", reference: "§2.1" },
      { methode: "PUT", chemin: "/api/backoffice/plans", role: "ADMIN_COMPAGNIE", description: "Modifie un gabarit non engagé sur un départ en vente.", reference: "§2.1" },
      { methode: "GET", chemin: "/api/backoffice/bus", role: "GERANT_AGENCE", description: "Flotte de la compagnie.", reference: "§2.1" },
      { methode: "POST", chemin: "/api/backoffice/bus", role: "ADMIN_COMPAGNIE", description: "{ plaque, planId, categorie }.", reference: "§2.1" },
      { methode: "GET", chemin: "/api/backoffice/lignes", role: "GERANT_AGENCE", description: "Lignes exploitées.", reference: "§2.1" },
      { methode: "POST", chemin: "/api/backoffice/lignes", role: "ADMIN_COMPAGNIE", description: "{ origine, destination, distanceKm?, dureeMin? }.", reference: "§2.1" },
      { methode: "GET", chemin: "/api/backoffice/agences", role: "GERANT_AGENCE", description: "Agences et continuité de leur séquence de billets.", reference: "§2.1" },
      { methode: "POST", chemin: "/api/backoffice/agences", role: "ADMIN_COMPAGNIE", description: "{ nom, ville, adresse?, horaires? }.", reference: "§2.1" },
      { methode: "GET", chemin: "/api/backoffice/trajets", role: "GERANT_AGENCE", description: "Départs planifiés et leur remplissage par canal.", reference: "§2.2" },
      { methode: "POST", chemin: "/api/backoffice/trajets", role: "ADMIN_COMPAGNIE", description: "Crée un départ : tarifs et allocation par canal.", reference: "§2.2-3" },
      { methode: "DELETE", chemin: "/api/backoffice/trajets", role: "ADMIN_COMPAGNIE", description: "Annule un départ. Motif obligatoire.", reference: "§2.2" },
      { methode: "POST", chemin: "/api/trajets/{tripId}/allocation", role: "GERANT_AGENCE", description: "Rééquilibre les quotas. { from, to, count }.", reference: "§2.3" },
      { methode: "PATCH", chemin: "/api/trajets/{tripId}/sieges", role: "GERANT_AGENCE", description: "Bloque ou débloque un siège (BLOQUE_ADMIN).", reference: "§2.8" },
      { methode: "GET", chemin: "/api/backoffice/utilisateurs", role: "ADMIN_COMPAGNIE", description: "Comptes staff et leurs rôles.", reference: "§1.5" },
      { methode: "POST", chemin: "/api/backoffice/utilisateurs", role: "ADMIN_COMPAGNIE", description: "Crée un compte staff, mot de passe haché.", reference: "§3.3" },
    ],
  },
];

const COULEURS = {
  GET: "accent",
  POST: "succes",
  PUT: "attention",
  PATCH: "attention",
  DELETE: "alerte",
} as const;

export default function DocumentationApi() {
  const total = GROUPES.reduce((somme, groupe) => somme + groupe.routes.length, 0);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6">
        <Link href="/" className="text-sm text-accent hover:underline">
          ← Mobembo
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">API Mobembo</h1>
        <p className="mt-1 text-sm text-texte-doux">
          {total} points d&apos;entrée. Toutes les réponses d&apos;erreur portent{" "}
          <code className="rounded bg-surface-alt px-1 py-0.5 text-xs">
            {"{ erreur, message, details? }"}
          </code>{" "}
          avec un code stable — <code className="text-xs">SIEGE_INDISPONIBLE</code>,{" "}
          <code className="text-xs">TROP_DE_VERROUS</code>,{" "}
          <code className="text-xs">CAISSE_DEJA_FERMEE</code>… La session voyage dans un cookie
          <code className="mx-1 text-xs">mobembo_session</code> httpOnly signé.
        </p>
      </header>

      <div className="space-y-5">
        {GROUPES.map((groupe) => (
          <Card key={groupe.titre} title={groupe.titre} subtitle={groupe.sous}>
            <Table headers={["Méthode", "Chemin", "Rôle requis", "Description", "CdC"]}>
              {groupe.routes.map((route) => (
                <tr key={`${route.methode}${route.chemin}`} className="align-top">
                  <td className="px-2 py-1.5">
                    <Badge tone={COULEURS[route.methode]}>{route.methode}</Badge>
                  </td>
                  <td className="px-2 py-1.5 font-mono text-xs">{route.chemin}</td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-xs text-texte-doux">
                    {route.role}
                  </td>
                  <td className="px-2 py-1.5 text-xs">{route.description}</td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-[10px] text-texte-doux">
                    {route.reference}
                  </td>
                </tr>
              ))}
            </Table>
          </Card>
        ))}
      </div>
    </div>
  );
}
