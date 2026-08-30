# Guide de l'agence — sources

Le livrable est `docs/guide-compagnie.pdf` (24 pages, texte sélectionnable,
captures intégrées).

```bash
python3 docs/guide-compagnie/build.py
```

**Le PDF et les captures ne sont pas versionnés** (voir `.gitignore`) : ce sont
des artefacts d'environ 3 Mo qui changeraient à chaque retouche d'interface.
Seuls les scripts qui les produisent sont suivis. Après un clone, refaites les
captures (voir plus bas) avant de lancer `build.py`.

Aucune dépendance : `pdf.py` écrit le PDF directement (polices base-14,
captures JPEG en DCTDecode). Le poste de développement n'a ni Chrome headless
ni bibliothèque PDF, et rasteriser le guide en images aurait donné un fichier
lourd, flou à l'impression et au texte non sélectionnable.

| Fichier | Rôle |
| ------- | ---- |
| `build.py` | Le contenu du guide, chapitre par chapitre, plus une vérification de mise en page (débordements, texte sous le pied de page). |
| `pdf.py` | Le moteur : pagination, blocs (titres, paragraphes, puces, étapes, encadrés, tableaux, images), écriture du fichier. |
| `captures/` | Les 20 captures, prises dans l'application réelle avec les données de `npm run seed`. |

## Refaire les captures

Les captures viennent de trois comptes de démonstration qui montrent trois
niveaux d'ouverture (voir `IDENTIFIANTS-TEST.md`) :

| Compte | Agence | Ce qu'il illustre |
| ------ | ------ | ----------------- |
| `+243810000021` | Étoile du Kasaï | Phases 1 à 3 : trajets, réservations, paiements et billets. |
| `+243810000020` | Kongo Express | Phase 1 seule : menu réduit, écran de phase non ouverte. |
| `+243810000002` | Transco Kin | Phase 4 : planification, référentiel, guichet, rapports. |

Lancez `npm run seed` puis `npm run dev`, connectez-vous avec le compte voulu
et capturez la fenêtre à environ 1240 × 900. Nommez le fichier selon la
numérotation existante et relancez `build.py`.

**Une capture périmée est pire qu'une capture absente** : si un écran change,
reprenez-la avant de rediffuser le guide.
