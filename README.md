# Mobembo — transport interurbain, RDC

**Une seule application Next.js**, frontend et backend, construite par phases :
référencement et recherche d'abord, réservation ensuite, billetterie complète
pour les agences qui la demandent.

> **Rien n'est imposé à une agence (note fonctionnelle, §6).** Le référencement
> est gratuit. Une agence peut publier ses trajets, ses tarifs et ses contacts
> sans vendre un seul billet en ligne, sans ERP et sans changer sa façon de
> travailler. Chaque phase suivante est un choix qu'elle fait, pas un préalable.

> **Règle non négociable de la billetterie (§1.2).** Dès qu'une agence vend en
> ligne, la base de données devient la seule source de vérité sur l'état d'un
> siège. Aucun siège n'est vendu, réservé, bloqué ou annulé en dehors du
> système — ni au guichet, ni par téléphone, ni par le chauffeur.

## Les deux modèles d'offre

Un voyageur cherche un départ ; il ne doit pas savoir quel niveau de
numérisation l'agence a atteint. La recherche fond donc deux modèles dans une
seule liste, en disant avant le clic ce que chacun permet :

| Objet | Ce qu'il exige de l'agence | Ce que le voyageur peut faire |
| ----- | -------------------------- | ----------------------------- |
| `schedules` — trajet publié (phase 1) | deux villes, une heure, des jours, un prix | consulter, appeler, WhatsApp, itinéraire |
| `schedules` + quota (phase 2) | + un nombre de places ouvertes par départ | réserver une place, sans payer |
| `schedule_tickets` — billet payé (phase 3) | + accepter 10 % de commission | payer par Mobile Money, billet QR **sans siège** |
| `trips` — départ programmé (phase 4) | + bus, plan de sièges, tarifs en deux devises | choisir son siège, payer, billet QR numéroté |

La phase 3 se greffe sur la réservation de phase 2 : §14.1 dit « après
réservation, le voyageur choisit un moyen de paiement ». Son billet ne porte
aucun siège — §14.3 n'en met pas, et « sélectionner la place » appartient à la
phase 4 (§19.2), au même titre que la gestion des véhicules (§19.4).

Une agence peut n'utiliser que la première ligne, indéfiniment. Les tables
`trips`, `trip_seats`, `tickets` et tout le POS restent intacts à côté, pour
celles qui montent.

## Ce qu'une agence voit

Une agence référencée hier n'a pas à comprendre un ERP pour commencer. Le
back-office n'affiche que les phases qui lui sont ouvertes (§29 : « les
fonctions affichées dépendent du rôle et de la phase activée pour l'agence »),
et une entrée fermée n'apparaît pas grisée : elle n'apparaît pas.

| Phase | Module | Écrans ajoutés | Qui l'ouvre |
| ----- | ------ | -------------- | ----------- |
| 1 | *socle, jamais fermé* | Tableau de bord, Trajets publiés, Fiche publique, Utilisateurs, Paramètres | — |
| 2 | `RESERVATION` | Réservations | équipe Mobembo |
| 3 | `PAIEMENT` | Paiements et billets, Reversements | équipe Mobembo |
| 4 | `ERP` | Planification, Référentiel, Guichet, Rapports, Journal d'audit | équipe Mobembo |
| 5 | `CONTROLE` | Application contrôleur | équipe Mobembo |

Deux niveaux, jamais confondus :

- **`companies.modules`** — ce que Mobembo a ouvert, depuis `/administration`.
  Une nouvelle agence reçoit `["RESERVATION"]` et rien d'autre.
- **`companies.advanced_view`** — l'interrupteur « Vue complète » du directeur,
  dans `/backoffice/parametres`. Il replie l'affichage sur l'essentiel sans rien
  fermer : les ventes, billets et données continuent. Il ne peut jamais élargir
  ce que Mobembo a ouvert.

Un écran fermé ne dit pas « accès refusé » : il explique ce que la phase
apporte, ce qu'elle demande en retour, et comment la demander.

## Démarrage

```bash
npm install
npm run seed     # démonstration : 2 compagnies complètes, 2 agences référencées seulement, 5 trajets publiés
npm run dev      # http://localhost:3000
```

### Comptes de démonstration

Mot de passe commun : `mobembo2026`

| Téléphone       | Rôle              | Accès                        |
| --------------- | ----------------- | ---------------------------- |
| `+243810000001` | `SUPER_ADMIN`     | back-office plateforme       |
| `+243810000002` | `ADMIN_COMPAGNIE` | back-office compagnie        |
| `+243810000003` | `GERANT_AGENCE`   | back-office + guichet        |
| `+243810000004` | `GUICHETIER`      | POS guichet                  |
| `+243810000005` | `CONTROLEUR`      | app contrôleur               |
| `+243810000020` | `ADMIN_COMPAGNIE` | Kongo Express — référencée seulement, aucune réservation en ligne |
| `+243810000021` | `ADMIN_COMPAGNIE` | Étoile du Kasaï — référencée, quelques places ouvertes en ligne |

Les deux derniers comptes sont là pour vérifier la promesse : ces agences n'ont
ni bus enregistré, ni plan de sièges, ni caisse, et sont pourtant visibles dans
la recherche et l'annuaire.

Les passagers n'ont pas de mot de passe : connexion par OTP SMS (§2.5.4). En
développement, le code est affiché à l'écran plutôt qu'envoyé.

### Scénarios de démonstration jouables

Le numéro du payeur pilote le comportement de l'opérateur Mobile Money simulé,
pour que les cas de recette §5.2 soient rejouables sans passerelle :

| Numéro se terminant par | Comportement                                     |
| ----------------------- | ------------------------------------------------ |
| `0000`                  | paiement refusé, siège libéré                    |
| `9999`                  | aucune réponse → `INDETERMINE` + ticket support  |
| autre                   | confirmation au premier polling                  |

## Les interfaces

| Chemin                | Interface                        | Phase |
| --------------------- | -------------------------------- | ----- |
| `/`                   | Accueil et recherche             | 1     |
| `/recherche`          | Résultats, deux modèles fondus   | 1-2   |
| `/agences`            | Annuaire des agences référencées | 1     |
| `/agences/[slug]`     | Fiche agence publique            | 1     |
| `/horaire/[id]`       | Fiche trajet + réservation       | 1-2   |
| `/mes-reservations`   | Réservations du voyageur (OTP)   | 2     |
| `/paiement/[id]`      | Paiement Mobile Money d'une réservation | 3 |
| `/billet-reservation/[id]` | Billet numérique QR, partage | 3     |
| `/mes-billets`        | Billets payés : à venir, utilisés, annulés, expirés | 3 |
| `/trajet/[id]`        | Choix du siège                   | 4     |
| `/backoffice`         | Espace agence                    | 1-4   |
| `/guichet`            | POS guichet                      | 4     |
| `/controle`           | App contrôleur                   | 5     |
| `/administration`     | Plateforme, indicateurs §7       | —     |
| `/api-doc`            | API documentée                   | —     |

Le back-office suit le même dégradé : « Ma présence Mobembo » (trajets publiés,
réservations, fiche publique) précède « Exploitation » (planification,
référentiel), et le bloc billetterie du tableau de bord n'apparaît que lorsque
l'agence l'utilise réellement.

## Commandes

```bash
npm run dev        # développement (Turbopack)
npm run build      # build de production
npm run start      # serveur de production
npm run seed       # (ré)initialise le jeu de démonstration
npm run schema:export  # régénère src/lib/db/schema.sql depuis le module canonique
npm test           # cahier de tests — 100 cas (base MySQL de test dédiée)
npm run typecheck  # TypeScript strict
npm run lint       # ESLint + React Compiler
```

## Architecture

```
src/
  lib/
    core/       ids, horodatage serveur, monnaie entière, erreurs métier
    db/         schema.ts (§3.5) + pool MySQL (mysql2) + transactions verrouillées
    domain/     règles métier — le cœur, sans dépendance à Next.js
                modules/access : phases ouvertes par agence (§29)
                schedules/reservations/directory : phases 1-2
                reservation-payments : paiement IdoloPay + billet QR (phase 3)
                offers : fusion des deux modèles pour la recherche
                planning/seats/bookings/tickets : billetterie complète
    auth/       sessions signées, scrypt, OTP, rôles
    payments/   abstraction PaymentProvider + opérateur simulé
    sms/        passerelle avec basculement fournisseur
    client/     stockage hors-ligne POS et contrôleur, vérification QR navigateur
    api/        enveloppe des route handlers
  app/
    (passager)/ accueil, recherche, annuaire, fiches, réservations, billets
    guichet/    POS
    controle/   app contrôleur
    backoffice/ espace agence — présence Mobembo puis exploitation
    administration/ plateforme : partenaires, annuaire, indicateurs §7
    api/        points d'entrée REST
tests/          cahier de tests
scripts/seed.ts jeu de démonstration
```

**Le domaine ne connaît pas Next.js.** `src/lib/domain/` s'exécute sous
`node --test` sans serveur : les règles qui portent de l'argent sont testables
sans HTTP, et resteraient valables derrière une autre façade.

### Choix techniques

**MySQL.** La §5.2 exige qu'« un seul billet soit émis » quand deux guichetiers
cliquent le même siège au même instant. Chaque opération qui touche à l'état
d'un siège (verrouillage, vente, revente) s'exécute dans une transaction qui
verrouille la ligne concernée par `SELECT ... FOR UPDATE` avant de la modifier,
puis vérifie le nombre de lignes réellement affectées par l'écriture : un
second guichetier qui vise le même siège attend la première transaction, relit
un état à jour, et échoue proprement plutôt que d'écraser une vente en cours.
`src/lib/db/index.ts` expose une couche de compatibilité (`prepare(sql).get/
all/run(...)`) au-dessus du pool `mysql2` : le reste du domaine s'exprime en
SQL standard, sans jamais connaître le pilote.

**Montants entiers.** Les prix, écarts de caisse et commissions circulent en
centimes. Aucun flottant ne touche une recette : §5.1 exige un écart de caisse
exact.

**Horodatage serveur.** §3.1 : aucune décision d'état ne dépend de l'horloge
d'un appareil. L'heure envoyée par un POS ou un terminal contrôleur est stockée
à titre informatif, à côté de l'heure serveur qui, elle, fait foi.

**Verrous relâchés à la lecture.** Un verrou de siège expiré est libéré au
prochain accès plutôt que par une tâche de fond : une tâche cron en panne
bloquerait silencieusement des sièges pendant des jours.

## Documentation

| Document                                            | Public                     |
| --------------------------------------------------- | -------------------------- |
| [Guide de l'agence (PDF)](docs/guide-compagnie.pdf)  | compagnies partenaires     |
| [Spécification technique](docs/specification.md)     | équipe de développement    |
| [Modèle de données](docs/modele-de-donnees.md)       | équipe, audit              |
| [Guide guichetier](docs/guide-guichetier.md)         | agents de vente            |
| [Guide contrôleur](docs/guide-controleur.md)         | agents d'embarquement      |
| [Manuel back-office](docs/manuel-back-office.md)     | gérants, direction         |
| [Cahier de recette](docs/recette.md)                 | recette contradictoire     |
| [Exploitation](docs/exploitation.md)                 | mise en production         |

## Configuration

| Variable                   | Défaut                       | Rôle                                   |
| -------------------------- | ---------------------------- | -------------------------------------- |
| `MOBEMBO_DATABASE_URL`     | absent (requis)              | connexion MySQL (`mysql://utilisateur:motdepasse@hote:port/base`) |
| `MOBEMBO_DB_POOL_SIZE`     | `10`                         | taille du pool de connexions           |
| `MOBEMBO_SESSION_SECRET`   | valeur de développement      | signature des cookies de session       |
| `MOBEMBO_WEBHOOK_SECRET`   | valeur de développement      | vérification des webhooks opérateurs simulés |
| `MOBEMBO_PAYMENT_MODE`     | absent (simulé)               | `live` pour brancher la passerelle IdoloPay |
| `IDOLOPAY_BASE_URL`        | `https://pay.idolotech.com`  | passerelle mobile money réelle         |
| `IDOLOPAY_API_KEY`         | absent                       | clé du compte marchand IdoloPay        |
| `IDOLOPAY_WEBHOOK_SECRET`  | absent                       | vérification du webhook `/api/webhooks/idolopay` |

**`MOBEMBO_DATABASE_URL` et les deux secrets sont requis en production.** Le
paramètre `ssl-mode=REQUIRED` dans l'URL active TLS, nécessaire pour la plupart
des clusters MySQL managés (ex. DigitalOcean). Tant que `MOBEMBO_PAYMENT_MODE`
n'est pas `live` ou que `IDOLOPAY_API_KEY` est vide, `MPESA`/`ORANGE_MONEY`/
`AIRTEL_MONEY` restent sur l'opérateur simulé : les scénarios de recette §5.2
continuent de fonctionner sans clé.

## Ce qui reste à faire avant la production

Le cahier des charges les identifie explicitement (§5.4) ; ils ne relèvent pas
du code :

- **Compte marchand IdoloPay réel.** `IdoloPayProvider` (`src/lib/payments/idolopay.ts`)
  implémente `PaymentProvider` et remplace l'opérateur simulé dès que
  `MOBEMBO_PAYMENT_MODE=live` et `IDOLOPAY_API_KEY` sont renseignés — voir
  Configuration ci-dessus. Il reste à obtenir un compte marchand dédié à
  Mobembo (pas un compte partagé avec une autre plateforme) et à déclarer
  `/api/webhooks/idolopay` comme `webhookUrl` de ce compte.
- **Passerelle SMS réelle.** Même principe, via `configureSmsProviders()`.
- **Localisation légale des données financières** (ARPTC, Banque Centrale).
- **Statut réglementaire de l'encaissement pour compte de tiers.**
- **Montants d'abonnement et plancher de revente**, calés sur les prix réels
  des axes.
- **Seuil d'écart de caisse toléré** pour le gate de phase 1.
