# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Les voyageurs interurbains en RDC cherchent un départ depuis un téléphone, souvent sur un réseau mobile contraint. Côté agences, l'utilisateur type n'est pas un informaticien : c'est un responsable ou un employé qui tient déjà ses horaires sur un tableau, et qui doit pouvoir les publier sans rien changer à son organisation. Les agents de guichet, contrôleurs et équipes d'exploitation utilisent les autres interfaces du même produit, quand l'agence choisit d'y venir.

## Product Purpose

Mobembo répond d'abord à quatre questions : qui voyage, où, quand, à quel prix. Il référence gratuitement les agences interurbaines, publie leurs horaires et leurs contacts, puis leur permet — si elles le veulent — d'ouvrir quelques places à la réservation, et seulement ensuite de vendre en ligne avec siège, paiement et billet QR. Le succès de la phase 1 se mesure en agences référencées, trajets publiés et recherches abouties, pas en billets vendus.

## Positioning

Le produit ne demande jamais à une agence de se numériser pour exister. Chaque niveau d'engagement est un choix réversible et clairement annoncé au voyageur avant qu'il ne clique. Quand une agence vend en ligne, la base de données devient l'unique source de vérité sur le siège quel que soit le canal : un siège payé est protégé contre une revente au guichet, et le billet reste vérifiable hors connexion.

## Operating Context

L'interface passager est une PWA mobile-first. Elle doit rester rapide sur une connexion 3G, fonctionner dans Chrome Android 90+ et garder des actions tactiles d'au moins 44 px. Les paiements passent par Mobile Money et les confirmations essentielles sont aussi envoyées par SMS.

## Capabilities and Constraints

- Recherche par ville de départ, ville d'arrivée et date, sur les deux modèles d'offre réunis.
- Annuaire public : fiche agence avec villes desservies, horaires, tarifs, téléphone, WhatsApp, adresse.
- Toute information publiée par une agence affiche sa date de dernière mise à jour.
- Une agence publie un trajet avec deux villes, une heure, des jours et un prix. Rien d'autre n'est obligatoire.
- Réservation sans paiement sur le quota que l'agence ouvre elle-même, départ par départ ; le reste de la capacité lui reste.
- Paiement Mobile Money d'une réservation et billet numérique à QR, sans siège numéroté, chez les agences qui ont ouvert la phase 3. Commission de 10 % retenue sur le reversement, jamais ajoutée au voyageur.
- Phases ouvertes agence par agence par l'équipe Mobembo ; le directeur choisit ensuite ce que son équipe affiche, sans jamais pouvoir élargir ce qui lui a été ouvert.
- Sélection et verrouillage du siège pendant sept minutes, prolongés au démarrage du paiement, sur les départs vendus en ligne.
- Paiement en USD ou CDF selon le wallet, sans saisie du PIN dans Mobembo.
- Billet QR, transfert gratuit et remise en vente selon les règles commerciales.
- Les départs à remplissage restent vendus au guichet et ne sont pas présentés comme des départs horaires en ligne.
- Français par défaut ; lingala et swahili sont prévus dans l'architecture.

## Brand Commitments

Le nom Mobembo et le logo M-route sont conservés. Le produit se présente désormais comme le point de rencontre des agences interurbaines de la RDC, dont la billetterie n'est qu'un des niveaux. Le monde visuel reste inchangé : grande photographie de bus, interface claire de gare, bleu profond, surfaces blanches, accent rouge franc.

## Evidence on Hand

Le produit, ses parcours, ses données de démonstration et ses règles sont documentés dans `README.md`, `docs/specification.md` (§0 pour les phases 1-2), la note fonctionnelle mobile par phase, et les routes de `src/app/`. Aucun témoignage, classement de destination ou chiffre marketing externe ne doit être inventé : les compteurs d'axes, d'agences et de villes affichés proviennent des données réelles.

## Product Principles

- Une agence n'est jamais obligée de se numériser pour être utile aux voyageurs.
- Le voyageur sait, avant de cliquer, s'il va réserver en ligne ou appeler l'agence.
- Une agence ne voit que les fonctions de la phase qui lui est ouverte : un écran inutile aujourd'hui est un écran qui la fait douter.
- Une information publiée porte sa date : c'est ce qui rend l'annuaire crédible.
- Le siège affiché comme réservé doit réellement l'être dans le système.
- L'action principale doit rester évidente sur petit écran et réseau lent.
- Le passager comprend le prix, le départ et la récupération de son billet avant de payer.
- La sécurité métier reste visible dans des mots simples, sans jargon technique.

## Accessibility & Inclusion

Préserver le zoom navigateur, les libellés explicites, la navigation clavier, des contrastes WCAG AA et des cibles tactiles d'au moins 44 px.
