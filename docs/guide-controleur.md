# Guide du contrôleur

Vous embarquez les passagers. Votre terminal fonctionne **sans réseau** — mais
seulement si vous avez préparé le voyage à la gare.

---

## 1. Avant le départ, à la gare, avec du réseau

C'est l'étape que rien ne remplace.

1. Ouvrez `/controle` et connectez-vous.
2. Choisissez votre départ dans la liste.
3. La page se charge : **le manifeste est enregistré sur votre terminal.**

Le manifeste contient la liste des passagers, leurs sièges, leurs codes, et la
clé qui permet de vérifier les QR **sans appeler le serveur**.

> **Si vous sautez cette étape et que le réseau tombe, vous ne pouvez plus rien
> vérifier.** Prenez l'habitude de charger le manifeste dès votre arrivée à la
> gare, même si vous avez du réseau à ce moment-là.

L'accueil affiche « Disponibles hors connexion » : ce sont les voyages que vous
pouvez contrôler sans réseau.

---

## 2. Scanner les passagers

Deux façons, au choix :

- **Caméra.** Cliquez **Ouvrir la caméra** et visez le QR du passager.
- **Saisie manuelle.** Tapez le code du billet (par exemple `K85X-7SHA`) et
  validez. À utiliser quand l'écran du passager est cassé, le papier froissé,
  ou le téléphone déchargé.

Le verdict s'affiche en grand.

### Les trois verdicts

| Verdict                          | Ce que ça veut dire                                        | Ce que vous faites                                              |
| -------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------- |
| 🟢 **EMBARQUEMENT AUTORISÉ**     | Billet valide, siège indiqué                               | Laissez monter, dirigez vers le siège                           |
| 🔴 **DÉJÀ SCANNÉ à HH:MM**       | Ce billet est déjà passé à l'heure indiquée                | Deux personnes avec le même billet : une seule monte             |
| 🔴 **REFUSÉ**                    | Le motif est écrit à l'écran                               | Voir ci-dessous                                                  |

### Les refus, et quoi répondre

- **« Siège revendu : ce QR n'est plus valable »** — le passager avait remis sa
  place en vente et quelqu'un l'a achetée. L'écran affiche **le nom du nouveau
  titulaire**. Le passager a été remboursé ; il n'a plus de place. Expliquez-le
  calmement, l'information est à l'écran.
- **« Billet transféré »** — le passager a donné sa place à un proche. C'est ce
  proche qui monte, avec son propre QR.
- **« Billet annulé »** — annulé par l'agence.
- **« Signature invalide »** — ce QR n'a pas été émis par cette compagnie. Faux
  billet, ou capture d'écran d'un billet d'ailleurs.
- **« Billet absent du manifeste »** — si vous avez du réseau, rechargez la page
  pour rafraîchir le manifeste. Le billet a peut-être été vendu après votre
  téléchargement.

---

## 3. Le passager en retard

**Un billet reste valable jusqu'à ce que vous clôturiez le manifeste**, même
après l'heure annoncée.

> Un passager arrivé à 8 h 40 pour un bus annoncé à 8 h 00 mais parti à 8 h 45
> embarque normalement. C'est le départ réel qui compte, pas l'horaire affiché.

Ne refusez jamais quelqu'un au motif que « l'heure est passée » tant que le bus
est là.

---

## 4. Au départ du bus

1. Cliquez **Enregistrer le départ effectif** au moment où le bus part
   réellement.
2. Cliquez **Clôturer le manifeste**.

La clôture fige le voyage : les billets non scannés deviennent des absences
(no-show), et le taux de remplissage réel est calculé.

> **N'enregistrez le départ que lorsque le bus part vraiment.** Tant que ce
> n'est pas fait, aucun passager ne peut être compté absent — c'est précisément
> ce qui protège les retardataires d'un bus lui-même en retard.

---

## 5. La synchronisation

Le compteur « À synchroniser » indique les scans que votre terminal n'a pas
encore remontés.

Elle se fait **automatiquement** dès que le réseau revient. Vous pouvez la
forcer avec le bouton **Synchroniser**.

Avant de clôturer un manifeste, assurez-vous que le compteur est à zéro si vous
avez du réseau : c'est ce qui permet au back-office de connaître le remplissage
réel du bus.

---

## Rappel

| Moment                        | Ce que vous faites                        |
| ----------------------------- | ----------------------------------------- |
| Arrivée à la gare, avec réseau | Charger le manifeste du départ            |
| Chaque passager               | Scanner le QR, ou saisir son code         |
| Verdict vert                  | Laisser monter                            |
| Verdict rouge                 | Lire le motif à voix haute, ne pas céder  |
| Passager en retard, bus là    | Embarquer normalement                     |
| Départ réel du bus            | Enregistrer le départ effectif            |
| Bus parti                     | Clôturer le manifeste                     |
