---
name: Mobembo
description: Billetterie interurbaine claire, fiable et ancrée en RDC.
colors:
  midnight: "#0d2142"
  midnight-deep: "#08162d"
  crimson: "#d7193f"
  crimson-deep: "#b71335"
  crimson-light: "#ff7a91"
  cloud: "#f3f5f9"
  white: "#ffffff"
  mist: "#eef1f6"
  ink: "#14213d"
  muted: "#5b6472"
  line: "#dce2eb"
  print-black: "#000000"
typography:
  display:
    fontFamily: "Outfit, Geist, system-ui, sans-serif"
    fontSize: "clamp(2.75rem, 7vw, 5.5rem)"
    fontWeight: 700
    lineHeight: 0.98
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 650
    lineHeight: 1.2
  micro:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "0.625rem"
    fontWeight: 500
    lineHeight: 1.2
  caption:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 500
    lineHeight: 1.3
  brand-title:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "1.0625rem"
    fontWeight: 700
    lineHeight: 1
rounded:
  control: "10px"
  surface: "14px"
  hero: "18px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
  section: "72px"
components:
  button-primary:
    backgroundColor: "{colors.crimson}"
    textColor: "{colors.white}"
    rounded: "{rounded.control}"
    padding: "14px 22px"
  button-primary-hover:
    backgroundColor: "{colors.crimson-deep}"
  input:
    backgroundColor: "{colors.mist}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "12px 14px"
---

# Design System: Mobembo

## Overview

**Creative North Star: “Le départ bien organisé”**

Mobembo reprend la franchise visuelle d'une gare bien tenue : le trajet est immédiatement lisible, l'action principale est franche et les informations de confiance restent proches du geste de réservation. La photographie donne le contexte réel ; le blanc et le bleu nuit structurent l'interface ; le rouge signale uniquement l'action ou une alerte.

**Key Characteristics:** photographie ample, hiérarchie directe, surfaces nettes, densité opérationnelle, accent rouge rare.

## Colors

Le bleu nuit porte la confiance et les grandes zones de marque ; le rouge congolais énergise les actions sans colorer tout l'écran. Les surfaces fonctionnelles restent blanches ou gris nuage.

## Typography

Geist reste la police de travail : formulaires, tableaux, POS, contrôle et back-office en dépendent pour la densité et la lisibilité debout. Sur l'accueil passager, les titres (h1 du hero, h2 de section, h3 de carte) portent Outfit — une police variable auto-hébergée au même titre que Geist, donc sans coût réseau supplémentaire — pour donner au premier écran un caractère plus affirmé sans toucher aux écrans opérationnels. Les titres restent massifs, serrés et courts ; le texte de formulaire est sobre et immédiatement lisible. Les microtextes de 10–11 px sont réservés à la signature de marque et aux mentions secondaires non essentielles. Les paragraphes ne dépassent pas 70 caractères par ligne.

## Motion

Un seul mouvement d'entrée au chargement du premier écran (titre, sous-titre, recherche en cascade légère), jamais de boucle décorative. Les interactions (survol carte, bouton) utilisent l'accélération `ease-departure` (`cubic-bezier(0.22, 1, 0.36, 1)`) sur 200–300 ms. `prefers-reduced-motion` coupe toutes les animations.

## Layout

Le contenu passager vit dans un conteneur maximal de 1280 px. Le premier écran juxtapose un hero photographique et une recherche superposée. La mise en page passe en une colonne sous 768 px ; les champs deviennent pleine largeur, sans perte d'ordre ni de libellé. Le rythme suit 8, 16, 24, 40 et 72 px.

## Elevation & Depth

Les grandes surfaces utilisent soit une bordure, soit une ombre ambiante, jamais les deux à forte intensité. La carte de recherche est la seule surface nettement soulevée de l'accueil ; les listes de trajets restent plus plates.

## Shapes

Les contrôles ont des angles de 10 px, les surfaces 14 px et le hero 18 px. Les pastilles sont réservées aux petits statuts. Les silhouettes restent rectangulaires et stables, proches d'une interface de transport.

## Components

### Brand mark

Le logo canonique est `public/brand/mobembo-logo.png` : un M-route bleu nuit et rouge suivi du mot MOBEMBO. Les headers l'affichent sur surface claire, à 28–40 px de haut, sans le recomposer en texte. `public/brand/mobembo-icon.png` est le master carré pour l'icône Next.js, Apple et le favicon. Toujours préserver les proportions et la transparence ; ne pas placer le wordmark sur une surface bleu nuit.

### Buttons

Les actions principales sont rouges, pleines et fermes. Le survol assombrit la couleur et déplace très légèrement le bouton ; le focus reçoit un anneau visible.

### Cards / Containers

Les cartes utilisent un fond blanc, un rayon de 14 px et des séparations internes plutôt qu'une collection de mini-cartes décoratives.

### Inputs / Fields

Les champs sont sur fond gris nuage, avec un libellé au-dessus et une icône fonctionnelle. Le focus blanchit le fond et prend une bordure rouge.

### Navigation

Le header blanc reste compact et lisible. La marque est à gauche, les destinations essentielles à droite ; sur mobile, seules les actions indispensables subsistent.

## Do's and Don'ts

### Do:

- **Do** réserver le rouge aux CTA, focus et alertes.
- **Do** montrer des bus, gares et parcours réels plutôt que des illustrations génériques.
- **Do** maintenir la recherche comme action dominante du premier écran.
- **Do** utiliser le wordmark partagé dans les headers et l'icône seule pour les petites surfaces système.

### Don't:

- **Don't** ajouter de verre décoratif, de texte en dégradé ou de halos néon.
- **Don't** inventer des prix, classements, témoignages ou chiffres de confiance.
- **Don't** réduire les cibles tactiles sous 44 px.
- **Don't** recolorer, étirer, réécrire ou enfermer le logo dans une nouvelle forme.
