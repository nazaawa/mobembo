---
version: 1
slug: "src-app-guichet-connexion-page-tsx"
primary_target: "src/app/guichet/connexion/page.tsx"
related_targets: ["src/app/guichet/connexion/formulaire.tsx"]
---

Scope: connexion professionnelle `/guichet/connexion`, mode Operate.

Audience et tâche: agent de guichet, gérant ou contrôleur en gare, sur terminal tactile ou ordinateur, qui doit ouvrir une session puis choisir son rôle actif sans ambiguïté.

Action principale: saisir téléphone et mot de passe puis se connecter. État secondaire: choisir un poste lorsque le compte cumule plusieurs rôles.

Contraintes: conserver l'authentification et les destinations existantes, cibles tactiles de 44 px minimum, erreurs et chargement explicites, navigation clavier, aucune promesse non documentée.

Direction: écran scindé inspiré de la référence utilisateur, traduit dans le système Mobembo bleu nuit, blanc et rouge. Le formulaire mène à gauche ; une agente de terminal et la promesse de session sûre soutiennent le contexte à droite. Le panneau photo disparaît sous 1024 px pour garder la tâche directe et légère.

Moment mémorable: l'agente de terminal devant les autocars relie immédiatement la connexion au travail réel en gare.
