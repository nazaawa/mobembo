# Guide du guichetier

Ce guide couvre votre journée de travail, de l'ouverture de la caisse à sa
fermeture. Gardez-le à portée les premiers jours.

---

## 1. Se connecter

Ouvrez `/guichet` sur le poste ou la tablette de l'agence.

Saisissez **votre numéro de téléphone** et **votre mot de passe**. Si vous
cumulez plusieurs fonctions — beaucoup de gérants sont aussi guichetiers —
l'application vous demande laquelle vous exercez maintenant. Choisissez
**Guichetier** pour vendre.

> **Pourquoi ce choix ?** Vous ne portez qu'une casquette à la fois. Cela évite
> qu'une annulation faite par le gérant soit attribuée au guichetier qu'il était
> cinq minutes plus tôt. Le changement est enregistré ; il ne vous est jamais
> reproché.

---

## 2. Ouvrir la caisse

**Aucune vente n'est possible sans session de caisse ouverte.**

1. Comptez l'argent que vous avez en caisse **avant** de commencer.
2. Saisissez ce montant dans « Fond de caisse initial ».
3. Choisissez la devise (USD ou CDF).
4. Cliquez **Ouvrir la caisse**.

> **Attention.** Ce montant est le point de départ du calcul d'écart en fin de
> journée. Le saisir faux, c'est se retrouver le soir avec un écart qu'on ne
> saura pas expliquer — et qui vous sera demandé.

---

## 3. Vendre un billet

1. Choisissez le **départ** dans la liste. Elle ne montre que les départs de
   votre agence, de −6 h à +36 h.
2. Sur le plan de sièges, **cliquez le siège** que le passager choisit.
3. Saisissez le **nom** et le **téléphone** du passager.
4. Vérifiez la devise encaissée.
5. Cliquez **Encaisser**.

Le billet s'affiche avec son code (par exemple `K85X-7SHA`) et son numéro de
séquence. Un SMS part automatiquement vers le passager.

### Sièges grisés

Certains sièges ne sont pas cliquables. Ce n'est **pas une panne** : ils
appartiennent au quota vendu en ligne, ou sont réservés par la compagnie.

> **Pourquoi ?** Le bus est partagé entre le guichet et la vente en ligne, avec
> un nombre de places fixé à l'avance pour chacun. C'est exactement ce qui vous
> permet de continuer à vendre quand internet tombe : vos places sont les
> vôtres, personne ne peut vous les prendre pendant la coupure.

Si vous avez besoin de plus de places au guichet — un départ qui se remplit vite
alors que la vente en ligne stagne —, **demandez au gérant** de rééquilibrer.
Cela prend dix secondes depuis le back-office.

### Le prix ne se modifie pas

Le prix vient de la grille tarifaire du départ. Vous ne pouvez pas le changer.
Si un prix vous paraît faux, prévenez le gérant : c'est lui qui corrige la
grille, et la correction est enregistrée.

---

## 4. Quand internet tombe

L'indicateur en haut de l'écran passe de **En ligne** à **Hors ligne**.

**Vous continuez à vendre**, à condition d'avoir téléchargé le départ à
l'avance. Sur l'écran de vente, le bouton **Télécharger pour hors-ligne**
conserve votre quota sur l'appareil. Prenez l'habitude de le faire le matin,
pour tous les départs de la journée.

Un compteur affiche en permanence : « **X sièges restants sur votre quota
local** ». Vous ne pouvez pas vendre au-delà.

Les billets vendus hors-ligne affichent « à synchroniser » à la place de leur
code. Notez le **siège** et le **nom** sur le reçu papier de la compagnie ; le
code définitif et le QR arrivent au retour du réseau.

Dès que le réseau revient, la synchronisation part **toute seule**. Le bandeau
en haut vous dit combien de ventes attendent encore.

> **S'il n'y a aucun quota téléchargé et pas de réseau, la vente s'arrête.**
> C'est volontaire : il n'existe aucun mode « vente hors système », aucun carnet
> papier de secours. Un billet vendu en dehors du système est un siège que la
> plateforme peut vendre en ligne au même instant — et un passager refusé à
> l'embarquement.

### Si une vente est refusée à la synchronisation

Un bandeau rouge apparaît avec le détail. **Prévenez immédiatement le gérant** :
le passager a payé, il faut le rembourser ou lui attribuer un autre siège. Ne
faites pas disparaître le message sans en avoir parlé.

---

## 5. Ce que vous ne pouvez pas faire

Ce ne sont pas des oublis de l'application :

- **Annuler une vente.** Seul le gérant le peut, avec un motif obligatoire.
- **Modifier un tarif.**
- **Vendre un siège d'un autre quota.**
- **Rouvrir une caisse fermée.**

Adressez-vous au gérant dans tous ces cas.

---

## 6. Fermer la caisse

En fin de service :

1. **Comptez physiquement** l'argent de votre caisse.
2. Cliquez **Fermer la caisse**.
3. Saisissez le montant compté.

L'écran affiche l'écart : `montant compté − (fond initial + ventes −
remboursements)`.

> **Comptez, ne recopiez pas.** L'application affiche ce qu'elle attend. Si vous
> recopiez ce chiffre, l'écart sera toujours nul et le contrôle ne sert plus à
> rien. Un écart honnête et expliqué ne pose aucun problème ; un écart maquillé,
> si.

Une caisse fermée ne se rouvre pas et ne se modifie pas. Assurez-vous d'avoir
terminé toutes vos ventes avant.

---

## Rappel des règles

| Situation                        | Ce que vous faites                    |
| -------------------------------- | ------------------------------------- |
| Siège grisé                      | Demander un rééquilibrage au gérant   |
| Prix qui paraît faux             | Prévenir le gérant, ne pas encaisser  |
| Passager veut annuler            | Renvoyer vers le gérant               |
| Coupure réseau, quota téléchargé | Continuer à vendre normalement        |
| Coupure réseau, aucun quota      | Arrêter la vente                      |
| Vente refusée à la synchro       | Prévenir le gérant immédiatement      |
| Fin de service                   | Compter, puis fermer la caisse        |
