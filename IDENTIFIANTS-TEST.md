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
