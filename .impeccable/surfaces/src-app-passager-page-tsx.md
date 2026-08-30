---
version: 1
slug: "src-app-passager-page-tsx"
primary_target: "src/app/(passager)/page.tsx"
related_targets: ["src/app/(passager)/search-form.tsx","src/app/(passager)/layout.tsx","src/app/(passager)/passenger-header.tsx"]
---

Scope: accueil passager `/`, mode Operate avec une ouverture persuasive courte.

Audience et tâche: voyageur interurbain en RDC, souvent sur mobile et connexion 3G, qui veut savoir quelles agences desservent son axe, à quelle heure, à quel prix — et seulement ensuite réserver ou appeler.

Action principale: rechercher par ville de départ, ville d'arrivée et date. Contenu de preuve: axes réellement couverts, agences référencées avec la fraîcheur de leurs informations, et la promesse faite aux agences — référencement gratuit, aucune obligation de vendre en ligne. Tout provient des données réelles.

Contraintes: garder les fonctions existantes, ne jamais présenter un horaire simplement référencé comme un départ réservable, cibles tactiles de 44 px, WCAG AA, aucune donnée commerciale inventée, performance PWA.

Direction: « Le départ bien organisé » — hero photographique de terminal congolais, recherche blanche superposée, bleu nuit et rouge mouvement. Les axes couverts se lisent en tableau des départs de gare, en lignes et colonnes, pas en grille de cartes ; l'annuaire suit la même logique de liste comparable. Moment mémorable: le bus prêt au départ derrière l'action de recherche, puis le tableau des départs qui donne d'un coup la couverture réelle du réseau.

Décision non résolue: mesurer le poids réel du hero et le LCP sur une connexion 3G représentative.
