# Manuel du back-office

Destiné au **gérant d'agence** et à la **direction de la compagnie**.

---

## Tableau de bord

Les recettes du jour, mises à jour à chaque vente : total, répartition
guichet / en ligne, caisses ouvertes, prochains départs avec leur remplissage.

C'est l'écran qui justifie le produit à lui seul : pour la première fois, la
recette de la journée est connue **pendant** la journée.

### Les alertes

Elles remontent automatiquement :

| Alerte                     | Ce que ça signifie                                                   |
| -------------------------- | -------------------------------------------------------------------- |
| **Trou de séquence**       | Un billet a été émis puis effacé, ou un carnet parallèle circule      |
| **Écart de caisse**        | Un écart au-delà du seuil configuré                                  |
| **Annulations anormales**  | Un même agent a annulé beaucoup de billets en 24 h                   |
| **Paiement indéterminé**   | Un opérateur n'a jamais répondu : un humain doit trancher            |

« Prise en compte » retire l'alerte de la liste — et enregistre qui l'a fait.
Une alerte acquittée n'est pas une alerte résolue : c'est une alerte dont
quelqu'un a pris la responsabilité.

---

## Planification

### Programmer un départ

Un départ = un bus + une ligne + une date et heure + une grille tarifaire + une
allocation par canal.

**Deux modes de départ**, choisis départ par départ :

- **Horaire fixe** — départ à l'heure annoncée. Seul mode vendable en ligne.
- **Au remplissage** — le bus part quand il est plein. Vente guichet
  uniquement, aucune heure affichée en ligne.

> Vendre en ligne une promesse d'horaire que l'exploitation ne tient pas est la
> première cause de litige. Le système refuse d'attribuer un quota en ligne à un
> départ au remplissage.

### L'allocation par canal

Sur un bus de 60 places, par exemple : 35 au guichet, 20 en ligne, 5 réservés à
la compagnie.

> **Pourquoi c'est indispensable.** Si le guichet perd internet, il continue de
> vendre son quota local sans risque de doublon avec les ventes en ligne. Sans
> allocation, une coupure réseau au guichet égale un surbooking garanti.

### Rééquilibrer en cours de vente

Depuis la fiche d'un départ. Cas courant : libérer vers le guichet les places en
ligne invendues, deux heures avant le départ.

Seules les places **encore disponibles** se déplacent. Chaque rééquilibrage est
enregistré au journal d'audit.

### Annuler un départ

Motif obligatoire. L'écran vous rappelle ensuite d'appliquer la grille de
responsabilité aux billets concernés : 100 % remboursés plus un avoir de 25 %,
imputés à la compagnie.

---

## Référentiel

**Agences** — points de vente physiques. Chaque agence affiche l'état de sa
séquence de billets ; « continue » est le résultat attendu.

**Plans de sièges** — gabarits réutilisables. L'éditeur montre le plan en train
de se construire ; cliquez un siège pour le désactiver (porte, moteur, roue).
Un plan déjà utilisé par un départ en vente ne se modifie pas : créez-en une
nouvelle version.

**Bus** — plaque, plan de sièges, catégorie (VIP ou standard).

**Lignes** — origine, destination, distance, durée estimée.

---

## Rapports

**Indicateurs de réussite** — le tableau qui décide du passage de jalon :

| Indicateur                         | Cible                |
| ---------------------------------- | -------------------- |
| Trous de séquence de billets       | 0                    |
| Paiements en statut indéterminé    | < 1 % des initiations |
| Remboursements au-delà de 48 h     | 0                    |
| Ventes hors-ligne en conflit       | 0                    |

**Recettes** par agence, par guichetier, par canal, par opérateur Mobile Money.

**Écarts de caisse par agent**, classés par écart absolu.

> Un écart cumulé proche de zéro avec un écart absolu élevé signale des erreurs
> de rendu de monnaie qui se compensent — un problème de formation. Un écart
> cumulé systématiquement négatif chez un seul agent est une autre conversation.

**Remplissage et no-show par axe.** Le remplissage se mesure **au scan
d'embarquement**, pas aux billets vendus : un bus dont tous les billets sont
vendus mais dont la moitié des passagers ne vient pas n'est pas un bus plein.

---

## Journal d'audit

Toute action sensible : annulation, remise, rééquilibrage, changement de tarif,
bascule de rôle, arbitrage de paiement. Chaque entrée porte l'utilisateur, son
rôle, l'appareil, l'adresse IP, l'horodatage, et les valeurs **avant et après**.

Filtrable par action, exportable en CSV.

Le journal est en **écriture seule** : rien n'y est modifiable ni supprimable,
depuis aucun écran. C'est le cœur du dispositif anti-fraude, et la raison pour
laquelle il n'existe pas de bouton « nettoyer le journal ».

---

## Reversements

Cycle hebdomadaire à J+7.

```
Reversement net = ventes en ligne
                − commission
                − remboursements imputés
                − pénalités
                − abonnement dû
                − réserve de garantie
```

Le détail ligne à ligne est consultable : la transparence évite les litiges.

> **Pourquoi J+7 et pas en temps réel ?** Ce décalage crée la trésorerie sur
> laquelle s'opèrent les compensations — remboursements, pénalités, abonnement.
> Sans lui, chaque remboursement deviendrait une facture à émettre et à
> recouvrer séparément.

La **réserve de garantie roulante** est retenue sur le volume en ligne et
restituée à la sortie du contrat.

---

## Paramètres

### Grille de renoncement

Chaque seuil est modifiable : délais, pourcentages, durée de validité des
avoirs. La grille du cahier des charges est pré-remplie ; les valeurs modifiées
apparaissent avec leur valeur de référence.

> **C'est un gradient d'incitation, pas un barème de sanctions.** Chaque option
> doit rester plus intéressante que la suivante, dans l'ordre qui arrange
> l'exploitation : transférer > revendre > reporter > annuler tard > ne pas
> venir. Serrer un seuil ne fait pas économiser — cela pousse les passagers vers
> l'option d'après, qui coûte plus cher à tout le monde.

### Commission et taux de change

Commission sur les ventes en ligne, prélevée sur la compagnie et **jamais
ajoutée au passager**. Le taux USD/CDF est daté à chaque modification : les
transactions passées conservent le taux qui leur a été appliqué.

### Grille de responsabilité

| Situation                          | Remboursement | Avoir  | Imputé à              |
| ---------------------------------- | ------------- | ------ | --------------------- |
| Trajet annulé, bus en panne        | 100 %         | 25 %   | compagnie             |
| Départ retardé de plus de 3 h      | 100 %         | —      | compagnie             |
| **Siège non honoré, vendu 2 fois** | **100 %**     | **100 %** | **compagnie + pénalité** |
| Échec de paiement, double débit    | 100 %         | —      | plateforme            |
| Annulation du passager             | grille        | —      | passager              |

> La ligne en gras est la plus importante du contrat. C'est la seule qui donne
> force contraignante au principe selon lequel aucun siège ne se vend hors
> système. La pénalité — le double du prix du billet — rend la fraude au guichet
> économiquement absurde.

### Arbitrer un paiement indéterminé

Quand un opérateur n'a jamais répondu, le paiement passe en `INDETERMINE`, le
siège **reste bloqué**, et un ticket support s'ouvre.

Vérifiez auprès de l'opérateur, puis tranchez : confirmé (les billets sont émis)
ou échoué (le siège est libéré). Le système ne devine jamais à votre place.

---

## Utilisateurs

Création de comptes staff avec leurs rôles. Un même compte peut cumuler
plusieurs rôles — un gérant est souvent aussi guichetier — mais **un seul est
actif par session**, et chaque bascule est tracée.

L'écran liste les bascules récentes : c'est ce qui permet d'attribuer une
annulation au gérant plutôt qu'au guichetier qu'il était cinq minutes plus tôt.
