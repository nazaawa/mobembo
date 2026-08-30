---
version: 1
slug: "src-app-passager-horaire-page-tsx"
primary_target: "src/app/(passager)/horaire/[scheduleId]/page.tsx"
related_targets: ["src/app/(passager)/horaire/[scheduleId]/reservation.tsx","src/app/(passager)/horaire/[scheduleId]/choix-date.tsx","src/components/offre.tsx"]
---

Scope: fiche d'un trajet publié `/horaire/[scheduleId]`, mode Operate.

Audience et tâche: voyageur qui a trouvé un départ dans la recherche et doit décider s'il le prend — puis, selon l'agence, réserver une place en ligne ou l'appeler.

Action principale: réserver une place (nom, téléphone, nombre de places) quand l'agence a ouvert un quota. Action de repli, tout aussi première classe: appeler ou écrire sur WhatsApp. Contenu de preuve: heure, jours de circulation, prix annoncé, point d'embarquement, date de dernière mise à jour.

Contraintes: la même page sert deux niveaux d'engagement et ne doit jamais les brouiller — un horaire non ouvert ne montre pas de formulaire, une réservation ne se présente jamais comme un paiement ou un billet. Cibles tactiles de 44 px, formulaire utilisable au pouce, aucune donnée inventée.

Direction: système Mobembo. Colonne de contenu à gauche, panneau d'action collant à droite qui bascule entre « Réserver ma place » et « Réservation auprès de l'agence » selon ce que l'agence a réellement ouvert. Le choix du jour est une bande de départs réels, jamais un calendrier générique.

Moment mémorable: la confirmation qui affiche une référence courte, à donner de vive voix à l'agence — la trace que le voyageur emporte, avec le SMS.
