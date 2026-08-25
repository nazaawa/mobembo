# Mobembo — plateforme de billetterie bus, RDC

Implémentation complète du cahier des charges v1.0 : **une seule application
Next.js**, frontend et backend, couvrant les trois phases du projet.

> **Règle non négociable (§1.2).** La base de données est la seule source de
> vérité sur l'état d'un siège. Aucun siège n'est vendu, réservé, bloqué ou
> annulé en dehors du système — ni au guichet, ni par téléphone, ni par le
> chauffeur. Toute l'architecture découle de cette contrainte.

## Démarrage

```bash
npm install
npm run seed     # jeu de démonstration : 1 compagnie, 2 agences, 3 axes, 28 départs
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

## Les quatre interfaces

| Chemin        | Interface        | Cahier des charges |
| ------------- | ---------------- | ------------------ |
| `/`           | PWA passager     | §2.5, §2.6, §2.9   |
| `/guichet`    | POS guichet      | §2.4               |
| `/controle`   | App contrôleur   | §2.7               |
| `/backoffice` | Back-office      | §2.1-2.3, §2.10-11 |
| `/api-doc`    | API documentée   | §4.2               |

## Commandes

```bash
npm run dev        # développement (Turbopack)
npm run build      # build de production
npm run start      # serveur de production
npm run seed       # (ré)initialise le jeu de démonstration
npm run schema:export  # régénère src/lib/db/schema.sql depuis le module canonique
npm test           # cahier de tests §5.2 — 40 cas (base MySQL de test dédiée)
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
    auth/       sessions signées, scrypt, OTP, rôles
    payments/   abstraction PaymentProvider + opérateur simulé
    sms/        passerelle avec basculement fournisseur
    client/     stockage hors-ligne POS et contrôleur, vérification QR navigateur
    api/        enveloppe des route handlers
  app/
    (passager)/ PWA passager
    guichet/    POS
    controle/   app contrôleur
    backoffice/ back-office
    api/        34 points d'entrée REST
tests/          cahier de tests §5.2
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
