# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Les passagers interurbains en RDC réservent un trajet depuis un téléphone, souvent sur un réseau mobile contraint. Les agents de guichet, contrôleurs et équipes d'exploitation utilisent les autres interfaces du même produit.

## Product Purpose

Mobembo réunit recherche de départ, choix du siège, paiement Mobile Money, billet QR et embarquement dans une seule billetterie. Le succès signifie qu'un passager peut acheter sans déplacement inutile et que le même siège ne peut jamais être vendu deux fois.

## Positioning

La base de données est l'unique source de vérité sur le siège, quel que soit le canal de vente. Un siège payé est protégé contre une revente au guichet, et le billet reste vérifiable hors connexion.

## Operating Context

L'interface passager est une PWA mobile-first. Elle doit rester rapide sur une connexion 3G, fonctionner dans Chrome Android 90+ et garder des actions tactiles d'au moins 44 px. Les paiements passent par Mobile Money et les confirmations essentielles sont aussi envoyées par SMS.

## Capabilities and Constraints

- Recherche par ville de départ, ville d'arrivée et date.
- Sélection et verrouillage du siège pendant sept minutes, prolongés au démarrage du paiement.
- Paiement en USD ou CDF selon le wallet, sans saisie du PIN dans Mobembo.
- Billet QR, transfert gratuit et remise en vente selon les règles commerciales.
- Les départs à remplissage restent vendus au guichet et ne sont pas présentés comme des départs horaires en ligne.
- Français par défaut ; lingala et swahili sont prévus dans l'architecture.

## Brand Commitments

Le nom Mobembo et la promesse « billetterie bus · RDC » sont conservés. La refonte demandée s'appuie sur une grande photographie de bus, une interface claire de billetterie, du bleu profond, des surfaces blanches et un accent rouge franc.

## Evidence on Hand

Le produit, ses parcours, ses données de démonstration et ses règles sont documentés dans `README.md`, `docs/specification.md` et les routes de `src/app/`. Aucun témoignage, classement de destination ou chiffre marketing externe ne doit être inventé.

## Product Principles

- Le siège affiché comme réservé doit réellement l'être dans le système.
- L'action principale doit rester évidente sur petit écran et réseau lent.
- Le passager comprend le prix, le départ et la récupération de son billet avant de payer.
- La sécurité métier reste visible dans des mots simples, sans jargon technique.

## Accessibility & Inclusion

Préserver le zoom navigateur, les libellés explicites, la navigation clavier, des contrastes WCAG AA et des cibles tactiles d'au moins 44 px.
