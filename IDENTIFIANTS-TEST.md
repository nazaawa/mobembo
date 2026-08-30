# Identifiants de test

Régénérés par `npm run seed` (voir `scripts/seed.ts`). Si le seed est relancé,
les comptes ci-dessous restent les mêmes ; seuls leurs IDs internes changent.

Mot de passe commun à tous les comptes staff : **`mobembo2026`**

Connexion staff : http://localhost:3000/guichet/connexion (numéro + mot de
passe). Cette page sert de connexion unique pour guichet, gérance, contrôle,
back-office et administration.

## Plateforme

| Téléphone       | Rôle          | Accès              | Nom               |
| --------------- | ------------- | ------------------ | ----------------- |
| `+243810000001` | `SUPER_ADMIN` | `/administration`  | Équipe plateforme |

## Transco Kin (Kinshasa ↔ Matadi, Kinshasa → Kikwit)

| Téléphone       | Rôle              | Accès               | Nom                   | Agence       |
| --------------- | ----------------- | -------------------- | --------------------- | ------------ |
| `+243810000002` | `ADMIN_COMPAGNIE` | `/backoffice`         | Direction Transco      | —            |
| `+243810000003` | `GERANT_AGENCE`   | `/backoffice` + `/guichet` | Chef de gare Limete | Gare de Limete |
| `+243810000004` | `GUICHETIER`      | `/guichet`             | Guichetier Limete      | Gare de Limete |
| `+243810000005` | `CONTROLEUR`      | `/controle`            | Contrôleur Transco     | Gare de Limete |

## Route d'Or (Lubumbashi ↔ Kolwezi)

| Téléphone       | Rôle              | Accès               | Nom                          | Agence             |
| --------------- | ----------------- | -------------------- | ----------------------------- | ------------------ |
| `+243810000006` | `ADMIN_COMPAGNIE` | `/backoffice`         | Direction Route d'Or           | —                   |
| `+243810000007` | `GERANT_AGENCE`   | `/backoffice` + `/guichet` | Chef de gare Lubumbashi   | Gare de Lubumbashi  |
| `+243810000008` | `GUICHETIER`      | `/guichet`             | Guichetier Lubumbashi          | Gare de Lubumbashi  |
| `+243810000009` | `CONTROLEUR`      | `/controle`            | Contrôleur Route d'Or          | Gare de Lubumbashi  |

Un `GERANT_AGENCE` cumule aussi le rôle `GUICHETIER` sur son agence (§1.5) :
après connexion, un écran demande de choisir la casquette active pour la
session.

## Agences référencées seulement — phases 1 et 2

Ces deux agences n'ont **ni bus enregistré, ni plan de sièges, ni caisse, ni
billet**. Elles sont pourtant visibles dans la recherche et dans l'annuaire :
c'est le scénario que le produit doit servir en premier.

| Téléphone       | Rôle              | Agence           | Phases ouvertes | Ce qu'elle démontre |
| --------------- | ----------------- | ---------------- | --------------- | ------------------- |
| `+243810000020` | `ADMIN_COMPAGNIE` | Kongo Express    | aucune (socle seul) | 5 entrées de menu au lieu de 12. 3 trajets publiés, le voyageur appelle. |
| `+243810000021` | `ADMIN_COMPAGNIE` | Étoile du Kasaï  | `RESERVATION`, `PAIEMENT` | + Réservations, quota de places, paiement Mobile Money et billets QR. |
| `+243810000002` | `ADMIN_COMPAGNIE` | Transco Kin      | toutes          | back-office complet — l'état d'arrivée, pas l'état de départ. |

Depuis `/administration`, le `SUPER_ADMIN` coche une phase sur une agence et
l'écran correspondant apparaît dans son back-office au rechargement suivant.
Le directeur, lui, replie ou déplie l'affichage depuis
`/backoffice/parametres` — sans jamais pouvoir ouvrir une phase lui-même.

Écrans à regarder : `/backoffice` (le bloc « Billetterie » disparaît),
`/backoffice/horaires`, `/backoffice/parametres` (phases et interrupteur de
vue), `/backoffice/vitrine`, et côté public `/agences/kongo-express` et
`/agences/etoile-du-kasai`. Avec le compte Kongo Express, `/backoffice/planification`
affiche l'écran « phase non ouverte » plutôt qu'un formulaire.

## Chauffeur indépendant (Fiston Kalala)

Créé via le vrai circuit de candidature partenaire (`type: INDEPENDANT`),
validé par le `SUPER_ADMIN` — une compagnie d'une seule personne avec ses
trois casquettes sur sa propre agence.

| Téléphone       | Rôle              | Accès                       | Nom            | Agence         |
| --------------- | ----------------- | ---------------------------- | -------------- | -------------- |
| `+243810000010` | `ADMIN_COMPAGNIE` | `/backoffice`                 | Fiston Kalala   | —              |
| `+243810000010` | `GERANT_AGENCE`   | `/backoffice` + `/guichet`    | Fiston Kalala   | Fiston Kalala  |
| `+243810000010` | `GUICHETIER`      | `/guichet`                    | Fiston Kalala   | Fiston Kalala  |

Sa voiture express (`LU 6600 VX`, Kolwezi → Lubumbashi, 10h00) apparaît dans
les résultats de recherche avec le badge « Voiture express ».

## Passager

Pas de compte ni de mot de passe : connexion par OTP SMS sur
http://localhost:3000/. En développement, le code OTP s'affiche à l'écran
au lieu d'être envoyé par SMS.

## Paiement Mobile Money simulé

Le numéro du payeur pilote le comportement de l'opérateur simulé :

| Numéro se terminant par | Comportement                                    |
| ------------------------ | ------------------------------------------------ |
| `0000`                    | paiement refusé, siège libéré                     |
| `9999`                    | aucune réponse → `INDETERMINE` + ticket support   |
| autre                     | confirmation au premier polling                   |
