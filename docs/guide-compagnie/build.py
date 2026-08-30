"""
Guide de l'agence — construction du PDF.

    python3 docs/guide-compagnie/build.py

Les captures viennent de l'application réelle (voir captures/). Régénérez-les
quand une interface change : un guide qui montre un écran disparu coûte plus
cher qu'un guide absent.
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from pdf import ACCENT, BLANC, LIGNE, MUTED, NAVY, SUCCES, Doc, largeur  # noqa: E402

RACINE = os.path.dirname(os.path.abspath(__file__))
CAP = os.path.join(RACINE, "captures")
SORTIE = os.path.abspath(os.path.join(RACINE, "..", "guide-compagnie.pdf"))


def capture(nom: str) -> str:
    return os.path.join(CAP, nom)


d = Doc()

# ---------------------------------------------------------------------------
# Couverture
# ---------------------------------------------------------------------------
d.nouvelle_page(numerotee=False)
d.rect(0, 0, d.largeur_page, d.hauteur_page, NAVY)
d.rect(0, d.hauteur_page - 300, d.largeur_page, 4, ACCENT)

d.texte(d.mg, d.hauteur_page - 118, "MOBEMBO", "F2", 13, BLANC, interlettre=3.2)
d.texte(d.mg, d.hauteur_page - 140, "Transport interurbain · RDC", "F1", 10, (0.72, 0.76, 0.82))

d.texte(d.mg, 468, "Guide de", "F2", 44, BLANC)
d.texte(d.mg, 418, "l’agence", "F2", 44, BLANC)
d.rect(d.mg, 392, 54, 3, ACCENT)

for i, ligne in enumerate(
    [
        "Tout ce que votre agence peut faire sur Mobembo,",
        "écran par écran — du référencement gratuit",
        "au paiement en ligne.",
    ]
):
    d.texte(d.mg, 352 - i * 19, ligne, "F1", 12.5, (0.80, 0.83, 0.88))

d.texte(d.mg, 250, "AU SOMMAIRE", "F2", 8, (0.55, 0.60, 0.68), interlettre=1.4)
sommaire = [
    "1. Ce que Mobembo fait pour vous",
    "2. Se connecter",
    "3. Le tableau de bord",
    "4. Publier vos trajets",
    "5. Votre fiche publique",
    "6. Recevoir des réservations",
    "7. Encaisser en ligne",
    "8. Vos utilisateurs",
    "9. Phases et affichage",
    "10. Aller plus loin",
    "11. Questions fréquentes",
]
for i, item in enumerate(sommaire):
    colonne = 0 if i < 6 else 1
    rang = i if i < 6 else i - 6
    d.texte(d.mg + colonne * 250, 228 - rang * 17, item, "F1", 10, (0.78, 0.81, 0.86))

d.texte(d.mg, 66, "Version 1 — août 2026", "F1", 9, (0.55, 0.60, 0.68))

# ---------------------------------------------------------------------------
# 1. Ce que Mobembo fait pour vous
# ---------------------------------------------------------------------------
d.titre1("Ce que Mobembo fait pour vous", "Chapitre 1")

d.paragraphe(
    "Mobembo est l’endroit où un voyageur cherche un départ interurbain : qui part, "
    "où, quand, à quel prix. Votre agence y est référencée gratuitement, et vous décidez "
    "de tout le reste."
)
d.paragraphe(
    "Le point important : vous n’êtes obligée à rien. Publier vos horaires suffit à être "
    "trouvée. Vendre en ligne, ouvrir des places, encaisser par Mobile Money, gérer votre "
    "guichet dans le système — ce sont des étapes séparées, que vous franchissez quand elles "
    "vous servent, et jamais avant."
)

d.encadre(
    "Le référencement est gratuit. Vous n’avez pas besoin d’un ordinateur, d’un logiciel de "
    "gestion, ni de changer votre façon de vendre vos billets pour apparaître sur Mobembo.",
    titre="À retenir",
)

d.titre2("Les cinq phases")
d.paragraphe(
    "Chaque phase ajoute des écrans à votre espace. Une phase que vous n’avez pas demandée "
    "n’apparaît pas du tout : votre menu reste court tant que votre activité l’est."
)
d.tableau(
    ["Phase", "Ce qu’elle vous apporte", "Ce qu’elle vous demande"],
    [
        [
            "1. Référencement",
            "Vos trajets, tarifs et coordonnées apparaissent dans la recherche et l’annuaire. Les voyageurs vous appellent.",
            "Publier deux villes, une heure, des jours et un prix. Rien d’autre.",
        ],
        [
            "2. Réservation",
            "Vous ouvrez quelques places par départ. Les voyageurs les retiennent à l’avance et paient chez vous.",
            "Consulter la liste des réservations avant chaque départ.",
        ],
        [
            "3. Paiement",
            "Le voyageur paie par Mobile Money et reçoit un billet numérique avec QR. Vous encaissez avant le départ.",
            "Accepter une commission de 10 % sur les billets payés via Mobembo.",
        ],
        [
            "4. Gestion d’agence",
            "Véhicules, plans de sièges, départs datés, vente au guichet, caisses et rapports de recettes.",
            "Que toute vente passe par le système, guichet compris.",
        ],
        [
            "5. Contrôle",
            "Scan des billets au départ, y compris sans réseau.",
            "Un appareil par contrôleur, synchronisé avant le départ.",
        ],
    ],
    [1.0, 2.0, 1.7],
)

d.paragraphe(
    "Une phase s’ouvre à votre demande, auprès de l’équipe Mobembo. Elle ne s’ouvre pas "
    "toute seule parce qu’elle existe : c’est vous qui savez si elle vous sera utile.",
    couleur=MUTED, taille=9.5,
)

# ---------------------------------------------------------------------------
# 2. Se connecter
# ---------------------------------------------------------------------------
d.titre1("Se connecter", "Chapitre 2")

d.paragraphe(
    "Une seule page de connexion sert à tous les postes de votre agence : direction, gérance, "
    "guichet et contrôle. Vous entrez votre numéro de téléphone et votre mot de passe."
)
d.image(capture("01-connexion.jpg"),
        "L’écran de connexion. Le même pour tous les postes de l’agence.")

d.titre2("Choisir son poste")
d.paragraphe(
    "Une même personne cumule souvent plusieurs rôles — un gérant est aussi guichetier. "
    "Après la connexion, vous choisissez celui avec lequel vous travaillez maintenant. "
    "Il reste le seul actif pendant toute la session."
)
d.image(capture("02-choix-poste.jpg"),
        "Le choix du poste apparaît seulement si votre compte cumule plusieurs rôles.")

d.encadre(
    "Chaque changement de poste est enregistré. C’est ce qui permet d’attribuer une annulation "
    "à un gérant plutôt qu’au guichetier qu’il était cinq minutes plus tôt — une protection "
    "pour vous autant que pour la plateforme.",
    titre="Pourquoi un seul rôle à la fois",
)

d.titre2("Les postes et ce qu’ils voient")
d.tableau(
    ["Poste", "Ce qu’il peut faire"],
    [
        ["Direction de la compagnie",
         "Tout l’espace agence : trajets, réservations, paiements, fiche publique, utilisateurs, paramètres."],
        ["Gérant d’agence",
         "Trajets publiés, réservations, fiche publique et, si la phase 4 est ouverte, la planification de son agence."],
        ["Guichetier",
         "Le poste de vente, si la phase 4 est ouverte. Il ne voit pas le back-office."],
        ["Contrôleur",
         "L’application de scan, si la phase 5 est ouverte. Rien d’autre."],
    ],
    [1.0, 2.4],
)

# ---------------------------------------------------------------------------
# 3. Le tableau de bord
# ---------------------------------------------------------------------------
d.titre1("Le tableau de bord", "Chapitre 3")

d.paragraphe(
    "C’est la première page après la connexion. Elle montre votre présence sur Mobembo : "
    "ce que vous avez publié, et ce que les voyageurs en ont fait."
)
d.image(capture("03-tableau-de-bord.jpg"),
        "Le tableau de bord d’une agence en phase 3 : trajets publiés, réservations à venir "
        "et passagers attendus au prochain départ.")

d.titre2("Ce que chaque chiffre veut dire")
d.puces([
    "Trajets publiés — le nombre de vos départs visibles dans la recherche des voyageurs.",
    "Réservations à venir — les places retenues sur vos départs qui n’ont pas encore eu lieu.",
    "Départs réservés aujourd’hui — les passagers que vous devez attendre au point d’embarquement ce jour-là.",
    "Alertes à traiter — les anomalies détectées par le système. Zéro est le bon chiffre.",
])

d.paragraphe(
    "Le tableau s’adapte à votre phase. Une agence qui n’a pas ouvert la réservation ne voit "
    "ni « réservations à venir » ni « passagers attendus » : ces cases seraient vides et "
    "n’apprendraient rien."
)
d.image(capture("15-vue-phase1.jpg"),
        "Le même écran pour une agence référencée seulement. Cinq entrées de menu au lieu "
        "de douze, trois chiffres au lieu de quatre.")

# ---------------------------------------------------------------------------
# 4. Publier vos trajets
# ---------------------------------------------------------------------------
d.titre1("Publier vos trajets", "Chapitre 4")

d.paragraphe(
    "C’est l’écran le plus important du guide. Un trajet publié, c’est votre départ tel que "
    "vous l’annoncez déjà sur votre tableau : « Kinshasa → Matadi, 6 h 30, du lundi au samedi, "
    "22 $, départ au rond-point Ngaba »."
)
d.encadre(
    "Aucun véhicule à enregistrer, aucun plan de sièges à dessiner, aucun prix en deux devises. "
    "Deux villes, une heure, des jours et un prix suffisent à être trouvée.",
    titre="Ce qui n’est pas demandé",
)
d.image(capture("04-trajets-publies.jpg"),
        "La liste de vos trajets publiés, avec leur état et les réservations reçues.")

d.titre2("Publier un premier trajet")
d.etapes([
    ("Ouvrez « Trajets publiés », puis « Publier un nouveau trajet »",
     "Le formulaire s’ouvre au-dessus de la liste."),
    ("Renseignez la ville de départ, la ville d’arrivée et l’heure",
     "L’heure est celle que vous annoncez à vos voyageurs, en heure de Kinshasa."),
    ("Choisissez les jours de circulation",
     "Cliquez sur les jours où ce départ roule. Un service qui ne roule que trois jours par "
     "semaine n’apparaîtra pas les autres jours."),
    ("Indiquez un prix",
     "En dollars, en francs, ou les deux. Une seule devise suffit."),
    ("Complétez ce qui aide le voyageur",
     "Point d’embarquement, durée estimée, type de véhicule, informations utiles. Tout cela "
     "est facultatif, mais un point d’embarquement précis évite des appels."),
    ("Publiez",
     "Votre trajet apparaît immédiatement dans la recherche."),
])
d.image(capture("05-publier-trajet.jpg"),
        "Le formulaire de publication. Seuls les quatre premiers champs sont obligatoires.")

d.titre2("Ouvrir des places à la réservation")
d.paragraphe(
    "Si la phase 2 est ouverte pour votre agence, une case en bas du formulaire vous permet "
    "de proposer un nombre de places sur Mobembo. C’est vous qui décidez combien."
)
d.encadre(
    "Mobembo ne suppose jamais que tout votre véhicule est disponible en ligne. Si vous ouvrez "
    "8 places sur un bus de 55, seules ces 8 places partent en ligne. Le reste continue de se "
    "vendre à votre guichet, exactement comme aujourd’hui.",
    titre="Vous gardez la main sur votre capacité",
)
d.image(capture("06-ouvrir-places.jpg"),
        "La case « Ouvrir des places à la réservation en ligne », en bas du formulaire.")

d.titre2("Modifier un prix ou une heure")
d.paragraphe(
    "Les tarifs changent, les horaires bougent. Le bouton « Prix / heure » de chaque ligne "
    "ouvre les seuls champs concernés, directement dans le tableau : deux clics, un chiffre, "
    "et c’est enregistré."
)
d.image(capture("07-maj-rapide.jpg"),
        "La mise à jour rapide. Le reste de la fiche n’est pas touché.")

d.titre3("Les autres actions d’une ligne")
d.puces([
    "Modifier — rouvre le formulaire complet, pour changer le point d’embarquement, les jours ou les informations.",
    "Suspendre — retire le départ de la recherche sans le supprimer. Vous indiquez un motif, que les voyageurs voient. Utile quand un véhicule est immobilisé.",
    "Republier — remet un départ suspendu dans la recherche.",
])

d.encadre(
    "Chaque information publiée affiche sa date de dernière mise à jour aux voyageurs. "
    "Un horaire tenu à jour inspire confiance ; un horaire vieux de six mois fait douter du "
    "reste de votre fiche. C’est la contrepartie du référencement gratuit.",
    titre="Pourquoi mettre à jour",
)

# ---------------------------------------------------------------------------
# 5. Votre fiche publique
# ---------------------------------------------------------------------------
d.titre1("Votre fiche publique", "Chapitre 5")

d.paragraphe(
    "Chaque agence référencée dispose d’une page publique sur Mobembo. C’est ce que lit un "
    "voyageur qui veut savoir qui vous êtes avant de monter dans votre bus."
)
d.image(capture("10-fiche-publique.jpg"),
        "L’écran « Fiche publique » : ce que vous remplissez.")

d.titre2("Le numéro compte plus que le reste")
d.paragraphe(
    "Sur un départ que vous n’avez pas ouvert à la réservation, votre téléphone est le seul "
    "moyen qu’a un voyageur de retenir sa place. Une fiche sans numéro réduit votre "
    "référencement à un affichage."
)
d.puces([
    "Téléphone — le numéro qui décroche vraiment, pas le siège social.",
    "WhatsApp — laissez vide si c’est le même numéro et qu’il n’a pas WhatsApp.",
    "Adresse principale — là où les voyageurs vous trouvent.",
    "Présentation — deux ou trois phrases, ce que vous diriez à quelqu’un qui appelle pour la première fois.",
    "Services proposés — un par ligne : bagage inclus, transport de colis, bus climatisé.",
])
d.image(capture("13-fiche-voyageur.jpg"),
        "La même fiche, vue par un voyageur. Les boutons Appeler et WhatsApp mènent "
        "directement à vous.")

d.titre2("Comment vous apparaissez dans la recherche")
d.paragraphe(
    "Vos départs se mêlent à ceux des autres agences sur le même axe, triés par heure. "
    "Une étiquette dit au voyageur, avant qu’il ne clique, ce qu’il pourra faire : réserver "
    "en ligne, ou vous appeler."
)
d.image(capture("14-recherche.jpg"),
        "Trois agences sur le même axe. Chacune affiche son mode de réservation et la "
        "fraîcheur de son information.")

# ---------------------------------------------------------------------------
# 6. Recevoir des réservations
# ---------------------------------------------------------------------------
d.titre1("Recevoir des réservations", "Chapitre 6")
d.paragraphe("Phase 2. Cet écran n’apparaît que si la réservation en ligne est ouverte pour vous.",
             couleur=MUTED, taille=9.5)

d.paragraphe(
    "Un voyageur qui réserve donne son nom, son téléphone et le nombre de places. Sa place "
    "est retenue immédiatement sur le quota que vous avez ouvert pour ce départ, et il reçoit "
    "une référence par SMS."
)
d.image(capture("08-reservations.jpg"),
        "Le suivi des réservations, trié par heure de départ à venir.")

d.titre2("Avant chaque départ")
d.etapes([
    ("Ouvrez « Réservations » et filtrez sur le départ concerné",
     "Les boutons au-dessus du tableau isolent un seul de vos départs."),
    ("Notez les passagers attendus",
     "Nom, téléphone, nombre de places et référence. C’est votre liste d’embarquement."),
    ("Encaissez au point de départ",
     "Sauf pour les réservations déjà payées en ligne, signalées comme telles."),
])

d.titre2("Annuler une réservation")
d.paragraphe(
    "Si un départ ne peut pas se faire, annulez la réservation depuis le tableau. Vous devez "
    "indiquer un motif : c’est la seule information que le voyageur recevra, par SMS. "
    "Écrivez-la comme vous la diriez au téléphone."
)
d.encadre(
    "Une annulation rend immédiatement la place au quota du jour. Un autre voyageur peut donc "
    "la prendre aussitôt.",
    titre="Effet immédiat",
)

d.titre3("Ce que le voyageur peut faire de son côté")
d.puces([
    "Retrouver ses réservations avec son numéro de téléphone, par un code SMS.",
    "Annuler lui-même avant le départ — la place revient alors dans votre quota.",
    "Vous appeler ou vous écrire sur WhatsApp depuis sa réservation.",
])

# ---------------------------------------------------------------------------
# 7. Encaisser en ligne
# ---------------------------------------------------------------------------
d.titre1("Encaisser en ligne", "Chapitre 7")
d.paragraphe("Phase 3. Cet écran n’apparaît que si le paiement en ligne est ouvert pour vous.",
             couleur=MUTED, taille=9.5)

d.paragraphe(
    "Après avoir réservé, le voyageur peut payer par Mobile Money. Dès que l’opérateur "
    "confirme, un billet numérique est émis avec un QR code, et l’argent vous revient au "
    "reversement."
)
d.image(capture("09-paiements-billets.jpg"),
        "L’écran « Paiements et billets » : billets vendus, montants encaissés, "
        "statut de chaque paiement.")

d.titre2("La règle qui protège tout le monde")
d.encadre(
    "Un billet n’existe qu’après confirmation du paiement par l’opérateur. Un paiement qui "
    "échoue ne laisse aucun billet valide derrière lui — seulement la réservation, que le "
    "voyageur peut encore régler chez vous. Vous ne verrez jamais un billet non payé se "
    "présenter à l’embarquement.",
    titre="Pas de paiement, pas de billet",
)

d.titre2("Ce que vous voyez")
d.puces([
    "Billets vendus et places vendues — les voyageurs attendus, payés d’avance.",
    "Encaissé en ligne — le montant total, et la commission Mobembo qui sera retenue.",
    "Paiements en cours — un opérateur qui n’a pas encore répondu. Le système ne devine jamais à sa place.",
    "Remboursements à traiter — les billets annulés après paiement.",
])

d.titre2("La commission")
d.paragraphe(
    "Mobembo retient 10 % sur les billets payés via la plateforme. Ce pourcentage est prélevé "
    "sur votre reversement, jamais ajouté au prix du voyageur : le montant qu’il paie est "
    "exactement celui que vous avez publié."
)
d.tableau(
    ["Exemple", "Montant"],
    [
        ["Prix que vous publiez", "25,00 $"],
        ["Ce que paie le voyageur", "25,00 $"],
        ["Commission Mobembo (10 %)", "2,50 $"],
        ["Ce qui vous revient", "22,50 $"],
    ],
    [2.0, 1.0],
)

d.titre2("Les remboursements")
d.paragraphe(
    "Quand un billet payé est annulé, le système invalide le billet — il ne passera plus au "
    "contrôle — et fait remonter la ligne dans « Remboursements à traiter ». Mobembo ne "
    "décaisse rien à votre place : vous remboursez par votre propre canal, puis vous le "
    "déclarez d’un clic pour sortir la ligne de la file."
)

# ---------------------------------------------------------------------------
# 8. Vos utilisateurs
# ---------------------------------------------------------------------------
d.titre1("Vos utilisateurs", "Chapitre 8")

d.paragraphe(
    "Vous n’avez pas à tout faire vous-même. La direction peut créer des comptes pour les "
    "employés qui mettent à jour les horaires, suivent les réservations ou tiennent le guichet."
)
d.image(capture("12-utilisateurs.jpg"),
        "Les comptes staff de votre agence et l’historique des bascules de rôle.")

d.titre2("Créer un compte")
d.etapes([
    ("Ouvrez « Utilisateurs », puis « Créer un compte staff »",
     "Réservé à la direction de la compagnie."),
    ("Renseignez le nom, le téléphone et un mot de passe initial",
     "Le téléphone sert d’identifiant : il doit être unique."),
    ("Choisissez le ou les rôles",
     "Un employé peut cumuler gérant et guichetier — il choisira son poste à chaque connexion."),
])

d.encadre(
    "Désactiver un compte coupe l’accès immédiatement, sans effacer l’historique de ce que "
    "cette personne a fait. C’est ce qu’il faut faire quand un employé quitte l’agence — "
    "jamais partager un mot de passe.",
    titre="Un départ dans l’équipe",
)

# ---------------------------------------------------------------------------
# 9. Phases et affichage
# ---------------------------------------------------------------------------
d.titre1("Phases et affichage", "Chapitre 9")

d.paragraphe(
    "L’écran « Paramètres » vous dit exactement où en est votre agence : quelles phases sont "
    "ouvertes, ce que chacune apporte, et ce que les suivantes vous demanderaient."
)
d.image(capture("11-parametres-phases.jpg"),
        "Les phases de votre agence. Chacune indique son état et son apport.")

d.titre2("L’interrupteur « Vue complète »")
d.paragraphe(
    "Il vous appartient. Désactivez-le pour replier votre espace sur l’essentiel — trajets "
    "publiés, réservations, fiche publique — quand un écran chargé ralentit votre équipe. "
    "Rien n’est fermé pour autant : vos ventes, vos billets et vos données continuent de "
    "fonctionner, et un clic les réaffiche."
)

d.titre2("Demander l’ouverture d’une phase")
d.paragraphe(
    "Si vous ouvrez un écran d’une phase que vous n’avez pas, Mobembo ne vous oppose pas un "
    "refus : il vous explique ce que cette phase apporte, ce qu’elle demande en retour, et "
    "comment la demander."
)
d.image(capture("16-module-ferme.jpg"),
        "Une phase non ouverte. L’écran explique plutôt que d’interdire.")

# ---------------------------------------------------------------------------
# 10. Aller plus loin
# ---------------------------------------------------------------------------
d.titre1("Aller plus loin", "Chapitre 10")
d.paragraphe(
    "Les deux dernières phases s’adressent aux agences qui veulent gérer toute leur "
    "billetterie dans Mobembo. Elles ne sont utiles qu’à partir d’un certain volume : "
    "n’y venez pas avant d’en avoir besoin.",
    couleur=MUTED, taille=9.5,
)

d.titre2("Phase 4 — Gestion d’agence")
d.paragraphe(
    "Vous enregistrez vos véhicules et leurs plans de sièges, puis vous programmez chaque "
    "départ à sa date. Le voyageur choisit alors un siège numéroté, et votre guichet vend "
    "dans le même système — sans jamais risquer de vendre deux fois la même place."
)
d.image(capture("17-planification.jpg"),
        "La planification : un départ = un bus + une ligne + une date + une grille tarifaire.")

d.paragraphe(
    "L’allocation par canal est le cœur du dispositif : vous répartissez les places entre "
    "votre guichet, la vente en ligne et votre réserve. Si votre guichet perd internet, il "
    "continue de vendre son quota local sans risque de doublon."
)
d.image(capture("18-referentiel.jpg"),
        "Le référentiel : agences, plans de sièges et véhicules.")
d.image(capture("20-guichet.jpg"),
        "Le poste de vente. Aucune vente n’est possible sans session de caisse ouverte — "
        "c’est ce qui rend l’écart de fin de journée calculable.")
d.image(capture("19-rapports.jpg"),
        "Les rapports : recettes par agence et par guichetier, répartition par canal, "
        "écarts de caisse.")

d.titre2("Phase 5 — Contrôle à l’embarquement")
d.paragraphe(
    "Le contrôleur scanne le QR de chaque billet au départ. Le verdict s’affiche en une "
    "fraction de seconde : billet valide, déjà contrôlé, ou invalide. L’appareil télécharge "
    "la liste des billets avant le départ et fonctionne ensuite sans réseau, ce qui est la "
    "situation normale au bord de la route."
)
d.paragraphe(
    "Cette phase suppose un appareil par contrôleur. Elle n’a de sens qu’une fois la phase 3 "
    "ou 4 en place, puisqu’elle contrôle des billets numériques.",
    couleur=MUTED, taille=9.5,
)

# ---------------------------------------------------------------------------
# 11. Questions fréquentes
# ---------------------------------------------------------------------------
d.titre1("Questions fréquentes", "Chapitre 11")

questions = [
    ("Le référencement est-il vraiment gratuit ?",
     "Oui. Publier vos trajets, vos tarifs et vos coordonnées ne coûte rien et n’engage à rien. "
     "Seul le paiement en ligne comporte une commission, et seulement sur les billets "
     "effectivement payés via Mobembo."),
    ("Dois-je vendre mes billets en ligne ?",
     "Non. Beaucoup d’agences publient seulement leurs horaires : le voyageur les appelle et "
     "achète comme avant. C’est un usage complet de Mobembo, pas une étape intermédiaire."),
    ("Combien de places dois-je ouvrir en ligne ?",
     "Ce que vous voulez, y compris aucune. Commencez petit — deux ou trois places sur un "
     "départ — et augmentez quand vous voyez qu’elles partent."),
    ("Que se passe-t-il si personne ne réserve ?",
     "Rien. Vos places restent disponibles à votre guichet. Une place ouverte en ligne et non "
     "réservée ne vous coûte rien."),
    ("Un voyageur peut-il annuler après avoir payé ?",
     "Oui, avant le départ. Son billet est invalidé et la ligne entre dans votre file de "
     "remboursements, que vous traitez par votre propre canal."),
    ("Puis-je changer mes prix quand je veux ?",
     "Oui, en deux clics depuis « Trajets publiés ». Les réservations déjà prises gardent le "
     "prix en vigueur au moment où elles ont été faites."),
    ("Qui voit mes chiffres ?",
     "Vous seule. Aucune agence ne voit les données d’une autre. L’équipe Mobembo n’intervient "
     "que pour ouvrir une phase ou traiter un incident de paiement."),
    ("J’ai perdu mon mot de passe.",
     "Contactez l’équipe Mobembo. Pour un employé, la direction de votre compagnie peut créer "
     "un nouveau compte et désactiver l’ancien."),
]
for question, reponse in questions:
    d.titre3(question)
    d.paragraphe(reponse, taille=9.8, apres=6)

d.titre2("Aide-mémoire")
d.tableau(
    ["Je veux…", "Où aller"],
    [
        ["Ajouter un départ", "Trajets publiés → Publier un nouveau trajet"],
        ["Changer un prix ou une heure", "Trajets publiés → Prix / heure"],
        ["Retirer temporairement un départ", "Trajets publiés → Suspendre"],
        ["Voir qui vient au prochain départ", "Réservations"],
        ["Voir ce que j’ai encaissé", "Paiements et billets"],
        ["Corriger mon numéro de téléphone", "Fiche publique"],
        ["Donner un accès à un employé", "Utilisateurs → Créer un compte staff"],
        ["Simplifier l’écran de mon équipe", "Paramètres → Vue complète"],
        ["Demander une nouvelle phase", "Paramètres → contacter l’équipe Mobembo"],
    ],
    [1.2, 2.0],
)

d.espace(6)
d.filet(d.y)
d.espace(14)
d.paragraphe(
    "Ce guide décrit l’application telle qu’elle fonctionne à la date indiquée en couverture. "
    "Les captures proviennent de l’application réelle, avec des données de démonstration.",
    couleur=MUTED, taille=9,
)

d.ecrire(SORTIE)
print(f"Guide écrit : {SORTIE}")
print(f"  {len(d.pages)} pages · {os.path.getsize(SORTIE) / 1024:.0f} Ko")


# ---------------------------------------------------------------------------
# Vérification de la mise en page
#
# Un guide se relit mal à l'œil sur 24 pages : ces contrôles attrapent les deux
# défauts qu'un lecteur remarque immédiatement — du texte qui déborde de la
# colonne, et du texte qui passe sous le pied de page.
# ---------------------------------------------------------------------------
import re  # noqa: E402

DROITE = d.largeur_page - d.md
PLANCHER = d.mb - 30  # zone du pied de page incluse

anomalies: list[str] = []
for numero, page in enumerate(d.pages, start=1):
    for op in page.ops:
        texte_op = op.decode("cp1252", "replace")
        m = re.match(
            r"BT /(F\d) ([\d.]+) Tf [\d.]+ [\d.]+ [\d.]+ rg(?: ([\d.]+) Tc)? "
            r"1 0 0 1 ([\d.]+) ([\d.]+) Tm \((.*)\) Tj",
            texte_op, re.S,
        )
        if not m:
            continue
        police, taille, interlettre, x, y, contenu = m.groups()
        x, y, taille = float(x), float(y), float(taille)
        contenu = contenu.replace("\\(", "(").replace("\\)", ")").replace("\\\\", "\\")
        fin = x + largeur(contenu, police, taille) + (
            float(interlettre) * len(contenu) if interlettre else 0
        )
        if fin > DROITE + 1.0:
            anomalies.append(
                f"p.{numero} débordement de {fin - DROITE:.1f} pt : « {contenu[:52]} »"
            )
        if y < PLANCHER and numero > 1:
            anomalies.append(f"p.{numero} sous le pied de page (y={y:.0f}) : « {contenu[:52]} »")

if anomalies:
    print(f"\n{len(anomalies)} anomalie(s) de mise en page :")
    for ligne in anomalies[:25]:
        print("  -", ligne)
    raise SystemExit(1)
print("  Mise en page vérifiée : aucun débordement, aucun texte sous le pied de page.")
