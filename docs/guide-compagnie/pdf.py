"""
Générateur PDF minimal — texte réel et JPEG intégrés, sans dépendance.

Le poste de travail n'a ni Chrome headless, ni wkhtmltopdf, ni bibliothèque
PDF. Plutôt que de rasteriser le guide en images (texte non sélectionnable,
fichier lourd, impression floue), ce module écrit le PDF directement : les
polices base-14 sont garanties par la spécification PDF, et les captures JPEG
s'intègrent telles quelles en DCTDecode, sans réencodage ni perte.

Usage : voir build.py, qui décrit le contenu et appelle Doc.
"""

from __future__ import annotations

import io
import zlib
from dataclasses import dataclass, field

A4 = (595.276, 841.890)

# Palette DESIGN.md, en composantes 0-1 pour l'opérateur `rg`.
NAVY = (0.051, 0.129, 0.259)
ACCENT = (0.843, 0.098, 0.247)
TEXTE = (0.078, 0.129, 0.239)
MUTED = (0.357, 0.392, 0.447)
LIGNE = (0.863, 0.886, 0.922)
FOND = (0.953, 0.961, 0.976)
ACCENT_DOUX = (1.0, 0.941, 0.953)
SUCCES = (0.086, 0.475, 0.294)
BLANC = (1.0, 1.0, 1.0)

# ---------------------------------------------------------------------------
# Métrique des polices base-14 (unités /1000). Les glyphes accentués de
# Helvetica ont la chasse de leur lettre de base : la table ASCII suffit, à
# condition de replier les accents dessus (voir `_largeur_char`).
# ---------------------------------------------------------------------------
_HELV = (
    "278 278 355 556 556 889 667 191 333 333 389 584 278 333 278 278 "
    "556 556 556 556 556 556 556 556 556 556 278 278 584 584 584 556 "
    "1015 667 667 722 722 667 611 778 722 278 500 667 556 833 722 778 "
    "667 778 722 667 611 722 667 944 667 667 611 278 278 278 469 556 "
    "333 556 556 500 556 556 278 556 556 222 222 500 222 833 556 556 "
    "556 556 333 500 278 556 500 722 500 500 500 334 260 334 584"
)
_HELV_B = (
    "278 333 474 556 556 889 722 238 333 333 389 584 278 333 278 278 "
    "556 556 556 556 556 556 556 556 556 556 333 333 584 584 584 611 "
    "975 722 722 722 722 667 611 778 722 278 556 722 611 833 722 778 "
    "667 778 722 667 611 722 667 944 667 667 611 333 278 333 584 556 "
    "333 556 611 556 611 556 333 611 611 278 278 556 278 889 611 611 "
    "611 611 389 556 333 611 556 778 556 556 500 389 280 389 584"
)

_LARGEURS = {
    "F1": [int(v) for v in _HELV.split()],
    "F2": [int(v) for v in _HELV_B.split()],
}
_LARGEURS["F3"] = _LARGEURS["F1"]  # Helvetica-Oblique a la chasse du romain.

# Repli des caractères WinAnsi hors ASCII vers une chasse connue.
_REPLI = {
    "à": "a", "â": "a", "ä": "a", "á": "a", "ã": "a", "å": "a",
    "é": "e", "è": "e", "ê": "e", "ë": "e",
    "î": "i", "ï": "i", "í": "i", "ì": "i",
    "ô": "o", "ö": "o", "ó": "o", "ò": "o", "õ": "o",
    "ù": "u", "û": "u", "ü": "u", "ú": "u",
    "ç": "c", "ñ": "n", "ÿ": "y",
    "À": "A", "Â": "A", "Ä": "A", "Á": "A",
    "É": "E", "È": "E", "Ê": "E", "Ë": "E",
    "Î": "I", "Ï": "I", "Ô": "O", "Ö": "O",
    "Ù": "U", "Û": "U", "Ü": "U", "Ç": "C",
}
_SPECIAUX = {
    "«": 556, "»": 556, "—": 1000, "–": 556, "…": 1000,
    "’": 222, "‘": 222, "“": 333, "”": 333,
    "·": 278, "°": 400, "€": 556, "→": 1000, "×": 584,
    " ": 278, " ": 200,
}


def _largeur_char(car: str, police: str) -> int:
    if car in _SPECIAUX:
        return _SPECIAUX[car]
    base = _REPLI.get(car, car)
    code = ord(base)
    if 32 <= code <= 126:
        return _LARGEURS[police][code - 32]
    return 556


def largeur(texte: str, police: str, taille: float) -> float:
    return sum(_largeur_char(c, police) for c in texte) * taille / 1000.0


def couper(texte: str, police: str, taille: float, maxi: float) -> list[str]:
    """Retour à la ligne au mot, sur la largeur disponible."""
    lignes: list[str] = []
    for paragraphe in texte.split("\n"):
        mots = paragraphe.split(" ")
        courante = ""
        for mot in mots:
            essai = mot if not courante else f"{courante} {mot}"
            if largeur(essai, police, taille) <= maxi or not courante:
                courante = essai
            else:
                lignes.append(courante)
                courante = mot
        lignes.append(courante)
    return lignes


def _echappe(texte: str) -> bytes:
    """Chaîne PDF en WinAnsi. Les caractères absents deviennent un repli lisible."""
    sortie = bytearray()
    for car in texte:
        try:
            octets = car.encode("cp1252")
        except UnicodeEncodeError:
            remplacement = {"→": "->", " ": " ", " ": " "}.get(car, "?")
            octets = remplacement.encode("cp1252", "replace")
        for octet in octets:
            if octet in (0x28, 0x29, 0x5C):  # ( ) \
                sortie += b"\\"
            sortie.append(octet)
    return bytes(sortie)


# ---------------------------------------------------------------------------
# Images JPEG
# ---------------------------------------------------------------------------
@dataclass
class Jpeg:
    donnees: bytes
    largeur_px: int
    hauteur_px: int
    composantes: int


def lire_jpeg(chemin: str) -> Jpeg:
    donnees = open(chemin, "rb").read()
    i = 2
    while i < len(donnees):
        if donnees[i] != 0xFF:
            i += 1
            continue
        marqueur = donnees[i + 1]
        if marqueur in (0xD8, 0x01) or 0xD0 <= marqueur <= 0xD7:
            i += 2
            continue
        longueur = int.from_bytes(donnees[i + 2 : i + 4], "big")
        if marqueur in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB):
            hauteur = int.from_bytes(donnees[i + 5 : i + 7], "big")
            largeur_px = int.from_bytes(donnees[i + 7 : i + 9], "big")
            composantes = donnees[i + 9]
            return Jpeg(donnees, largeur_px, hauteur, composantes)
        i += 2 + longueur
    raise ValueError(f"En-tête JPEG illisible : {chemin}")


# ---------------------------------------------------------------------------
# Document
# ---------------------------------------------------------------------------
@dataclass
class Page:
    ops: list[bytes] = field(default_factory=list)
    images: dict[str, str] = field(default_factory=dict)  # nom local -> clé image


class Doc:
    def __init__(self, marge_g=56.0, marge_d=56.0, marge_h=64.0, marge_b=58.0):
        self.largeur_page, self.hauteur_page = A4
        self.mg, self.md, self.mh, self.mb = marge_g, marge_d, marge_h, marge_b
        self.contenu = self.largeur_page - marge_g - marge_d
        self.pages: list[Page] = []
        self.images: dict[str, Jpeg] = {}
        self.page: Page | None = None
        self.y = 0.0
        self.numeroter = True
        self.titre_courant = ""

    # -- pagination --------------------------------------------------------
    def nouvelle_page(self, numerotee: bool = True) -> None:
        self.page = Page()
        self.pages.append(self.page)
        self.y = self.hauteur_page - self.mh
        self.page.numerotee = numerotee  # type: ignore[attr-defined]

    def place(self, hauteur: float) -> None:
        if self.page is None:
            self.nouvelle_page()
        if self.y - hauteur < self.mb:
            self.nouvelle_page()

    # -- primitives --------------------------------------------------------
    def _op(self, data: bytes) -> None:
        assert self.page is not None
        self.page.ops.append(data)

    def texte(self, x: float, y: float, txt: str, police: str, taille: float,
              couleur=TEXTE, interlettre: float = 0.0) -> None:
        r, v, b = couleur
        tc = f" {interlettre:.2f} Tc" if interlettre else ""
        self._op(
            b"BT /" + police.encode() + f" {taille:.2f} Tf {r:.3f} {v:.3f} {b:.3f} rg"
            f"{tc} 1 0 0 1 {x:.2f} {y:.2f} Tm (".encode()
            + _echappe(txt)
            + b") Tj 0 Tc ET"
        )

    def rect(self, x: float, y: float, w: float, h: float, couleur, remplir=True) -> None:
        r, v, b = couleur
        if remplir:
            self._op(f"{r:.3f} {v:.3f} {b:.3f} rg {x:.2f} {y:.2f} {w:.2f} {h:.2f} re f".encode())
        else:
            self._op(
                f"{r:.3f} {v:.3f} {b:.3f} RG 0.7 w {x:.2f} {y:.2f} {w:.2f} {h:.2f} re S".encode()
            )

    def filet(self, y: float, couleur=LIGNE, epaisseur=0.7, x0=None, x1=None) -> None:
        r, v, b = couleur
        x0 = self.mg if x0 is None else x0
        x1 = self.largeur_page - self.md if x1 is None else x1
        self._op(
            f"{r:.3f} {v:.3f} {b:.3f} RG {epaisseur} w {x0:.2f} {y:.2f} m {x1:.2f} {y:.2f} l S".encode()
        )

    # -- blocs -------------------------------------------------------------
    def paragraphe(self, txt: str, police="F1", taille=10.0, couleur=TEXTE,
                   interligne=1.45, apres=9.0, indent=0.0) -> None:
        larg = self.contenu - indent
        lignes = couper(txt, police, taille, larg)
        pas = taille * interligne
        for ligne in lignes:
            self.place(pas)
            self.y -= pas
            self.texte(self.mg + indent, self.y, ligne, police, taille, couleur)
        self.y -= apres

    def titre1(self, txt: str, sur_titre: str | None = None) -> None:
        self.nouvelle_page()
        self.titre_courant = txt
        if sur_titre:
            self.y -= 13
            self.texte(self.mg, self.y, sur_titre.upper(), "F2", 8.5, ACCENT, interlettre=1.1)
            self.y -= 8
        lignes = couper(txt, "F2", 25.0, self.contenu)
        for ligne in lignes:
            self.y -= 29
            self.texte(self.mg, self.y, ligne, "F2", 25.0, NAVY)
        self.y -= 14
        self.filet(self.y, ACCENT, 1.6, x1=self.mg + 54)
        self.y -= 20

    def titre2(self, txt: str) -> None:
        self.place(58)
        self.y -= 24
        lignes = couper(txt, "F2", 14.5, self.contenu)
        for i, ligne in enumerate(lignes):
            if i:
                self.y -= 18
            self.texte(self.mg, self.y, ligne, "F2", 14.5, NAVY)
        self.y -= 13

    def titre3(self, txt: str) -> None:
        self.place(40)
        self.y -= 16
        self.texte(self.mg, self.y, txt, "F2", 10.5, NAVY)
        self.y -= 13

    def puces(self, items: list[str], taille=10.0, apres=9.0) -> None:
        for item in items:
            lignes = couper(item, "F1", taille, self.contenu - 15)
            pas = taille * 1.45
            self.place(pas * len(lignes))
            for i, ligne in enumerate(lignes):
                self.y -= pas
                if i == 0:
                    self.rect(self.mg + 3.5, self.y + 3.0, 3.0, 3.0, ACCENT)
                self.texte(self.mg + 15, self.y, ligne, "F1", taille, TEXTE)
            self.y -= 3
        self.y -= apres

    def etapes(self, items: list[tuple[str, str]], apres=10.0) -> None:
        """Suite numérotée : (titre de l'étape, explication)."""
        for numero, (titre, detail) in enumerate(items, start=1):
            lignes_t = couper(titre, "F2", 10.0, self.contenu - 26)
            lignes_d = couper(detail, "F1", 9.5, self.contenu - 26) if detail else []
            hauteur = 14.5 * len(lignes_t) + 13.8 * len(lignes_d) + 9
            self.place(hauteur)
            haut = self.y
            for ligne in lignes_t:
                self.y -= 14.5
                self.texte(self.mg + 26, self.y, ligne, "F2", 10.0, NAVY)
            for ligne in lignes_d:
                self.y -= 13.8
                self.texte(self.mg + 26, self.y, ligne, "F1", 9.5, MUTED)
            self.rect(self.mg, haut - 15.5, 17, 17, ACCENT)
            self.texte(
                self.mg + 8.5 - largeur(str(numero), "F2", 9.5) / 2,
                haut - 11.5, str(numero), "F2", 9.5, BLANC,
            )
            self.y -= 9
        self.y -= apres

    def encadre(self, txt: str, titre: str | None = None, ton=ACCENT) -> None:
        fond = ACCENT_DOUX if ton == ACCENT else FOND
        lignes = couper(txt, "F1", 9.5, self.contenu - 30)
        hauteur = 13.8 * len(lignes) + (16 if titre else 0) + 20
        self.place(hauteur + 8)
        haut = self.y
        self.rect(self.mg, haut - hauteur, self.contenu, hauteur, fond)
        self.rect(self.mg, haut - hauteur, 2.4, hauteur, ton)
        self.y -= 16
        if titre:
            self.texte(self.mg + 15, self.y, titre, "F2", 9.5, ton)
            self.y -= 14
        for ligne in lignes:
            self.texte(self.mg + 15, self.y, ligne, "F1", 9.5, TEXTE)
            self.y -= 13.8
        self.y = haut - hauteur - 14

    def tableau(self, entetes: list[str], lignes: list[list[str]],
                largeurs: list[float]) -> None:
        total = sum(largeurs)
        cols = [self.contenu * w / total for w in largeurs]

        def dessine_entete() -> None:
            self.place(26)
            self.y -= 20
            self.rect(self.mg, self.y - 5, self.contenu, 25, NAVY)
            x = self.mg + 9
            for i, titre in enumerate(entetes):
                self.texte(x, self.y + 2.5, titre.upper(), "F2", 7.6, BLANC, interlettre=0.7)
                x += cols[i]
            self.y -= 9

        dessine_entete()
        for rang, ligne in enumerate(lignes):
            paquets = [couper(c, "F1", 9.0, cols[i] - 14) for i, c in enumerate(ligne)]
            hauteur = 12.6 * max(len(p) for p in paquets) + 11
            if self.y - hauteur < self.mb:
                self.nouvelle_page()
                dessine_entete()
            if rang % 2 == 1:
                self.rect(self.mg, self.y - hauteur + 6, self.contenu, hauteur, FOND)
            haut = self.y
            x = self.mg + 9
            for i, paquet in enumerate(paquets):
                yy = haut
                for texte_ligne in paquet:
                    yy -= 12.6
                    self.texte(x, yy, texte_ligne, "F2" if i == 0 else "F1", 9.0,
                               NAVY if i == 0 else TEXTE)
                x += cols[i]
            self.y -= hauteur
            self.filet(self.y + 5)
        self.y -= 12

    def image(self, chemin: str, legende: str | None = None,
              largeur_max: float | None = None) -> None:
        jpeg = self.images.get(chemin) or lire_jpeg(chemin)
        self.images[chemin] = jpeg
        larg = largeur_max or self.contenu
        ratio = jpeg.hauteur_px / jpeg.largeur_px
        haut_img = larg * ratio

        dispo = self.hauteur_page - self.mh - self.mb - 34
        if haut_img > dispo:
            haut_img = dispo
            larg = haut_img / ratio

        lignes_leg = couper(legende, "F1", 8.6, self.contenu) if legende else []
        besoin = haut_img + 4 + 12.5 * len(lignes_leg) + 16
        self.place(besoin)

        self.y -= haut_img
        x = self.mg + (self.contenu - larg) / 2
        nom = f"Im{len(self.images)}_{abs(hash(chemin)) % 100000}"
        assert self.page is not None
        self.page.images[nom] = chemin
        # Cadre fin : une capture d'écran sur fond blanc a besoin d'une limite.
        self.rect(x - 0.5, self.y - 0.5, larg + 1, haut_img + 1, LIGNE, remplir=False)
        self._op(
            f"q {larg:.2f} 0 0 {haut_img:.2f} {x:.2f} {self.y:.2f} cm /{nom} Do Q".encode()
        )
        self.y -= 13
        for ligne in lignes_leg:
            self.texte(self.mg, self.y, ligne, "F1", 8.6, MUTED)
            self.y -= 12.5
        self.y -= 8

    def espace(self, h: float) -> None:
        self.y -= h

    # -- sortie ------------------------------------------------------------
    def _pieds_de_page(self) -> None:
        for numero, page in enumerate(self.pages, start=1):
            if not getattr(page, "numerotee", True):
                continue
            self.page = page
            y = self.mb - 22
            self.filet(y + 13, LIGNE, 0.6)
            self.texte(self.mg, y, "Mobembo — Guide de l’agence", "F1", 8.0, MUTED)
            libelle = str(numero)
            self.texte(
                self.largeur_page - self.md - largeur(libelle, "F1", 8.0),
                y, libelle, "F1", 8.0, MUTED,
            )

    def ecrire(self, chemin: str) -> None:
        self._pieds_de_page()

        objets: list[bytes] = []

        def ajoute(corps: bytes) -> int:
            objets.append(corps)
            return len(objets)

        polices = {
            "F1": b"/BaseFont /Helvetica",
            "F2": b"/BaseFont /Helvetica-Bold",
            "F3": b"/BaseFont /Helvetica-Oblique",
        }
        refs_polices = {}
        for nom, base in polices.items():
            refs_polices[nom] = ajoute(
                b"<< /Type /Font /Subtype /Type1 " + base + b" /Encoding /WinAnsiEncoding >>"
            )

        refs_images: dict[str, int] = {}
        for chemin_img, jpeg in self.images.items():
            espace = b"/DeviceRGB" if jpeg.composantes == 3 else b"/DeviceGray"
            entete = (
                b"<< /Type /XObject /Subtype /Image /Width "
                + str(jpeg.largeur_px).encode()
                + b" /Height " + str(jpeg.hauteur_px).encode()
                + b" /ColorSpace " + espace
                + b" /BitsPerComponent 8 /Filter /DCTDecode /Length "
                + str(len(jpeg.donnees)).encode() + b" >>\nstream\n"
            )
            refs_images[chemin_img] = ajoute(entete + jpeg.donnees + b"\nendstream")

        # Chaque page produit deux objets (flux + page) ; l'arbre des pages
        # vient juste après, et sa référence doit être connue d'avance pour
        # que chaque page puisse pointer vers son parent.
        ref_pages = len(objets) + 2 * len(self.pages) + 1
        refs_page: list[int] = []
        for page in self.pages:
            flux = zlib.compress(b"\n".join(page.ops))
            ref_flux = ajoute(
                b"<< /Length " + str(len(flux)).encode()
                + b" /Filter /FlateDecode >>\nstream\n" + flux + b"\nendstream"
            )
            xobjets = b""
            if page.images:
                entrees = b" ".join(
                    f"/{nom} {refs_images[chemin_img]} 0 R".encode()
                    for nom, chemin_img in page.images.items()
                )
                xobjets = b" /XObject << " + entrees + b" >>"
            ressources = (
                b"/Resources << /Font << "
                + b" ".join(f"/{n} {r} 0 R".encode() for n, r in refs_polices.items())
                + b" >>" + xobjets + b" >>"
            )
            refs_page.append(
                ajoute(
                    b"<< /Type /Page /Parent " + str(ref_pages).encode() + b" 0 R "
                    + f"/MediaBox [0 0 {A4[0]:.3f} {A4[1]:.3f}] ".encode()
                    + ressources + b" /Contents " + str(ref_flux).encode() + b" 0 R >>"
                )
            )

        ref_arbre = ajoute(
            b"<< /Type /Pages /Count " + str(len(refs_page)).encode()
            + b" /Kids [" + b" ".join(f"{r} 0 R".encode() for r in refs_page) + b"] >>"
        )
        assert ref_arbre == ref_pages, (ref_arbre, ref_pages)

        # Les métadonnées ne suivent pas WinAnsi mais PDFDocEncoding : un tiret
        # cadratin y devient un caractère arbitraire dans le titre de l'onglet.
        # La chaîne hexadécimale UTF-16BE avec BOM lève l'ambiguïté et évite au
        # passage tout échappement.
        def _utf16(texte: str) -> bytes:
            return b"<FEFF" + texte.encode("utf-16-be").hex().upper().encode() + b">"

        ref_info = ajoute(
            b"<< /Title " + _utf16("Mobembo — Guide de l'agence")
            + b" /Author " + _utf16("Mobembo")
            + b" /Subject " + _utf16(
                "Guide d'utilisation de la plateforme Mobembo pour les compagnies de transport"
            )
            + b" /Creator " + _utf16("Mobembo") + b" >>"
        )
        ref_catalogue = ajoute(b"<< /Type /Catalog /Pages " + str(ref_arbre).encode() + b" 0 R >>")

        sortie = io.BytesIO()
        sortie.write(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
        offsets = [0]
        for i, corps in enumerate(objets, start=1):
            offsets.append(sortie.tell())
            sortie.write(f"{i} 0 obj\n".encode() + corps + b"\nendobj\n")
        depart_xref = sortie.tell()
        sortie.write(f"xref\n0 {len(objets) + 1}\n".encode())
        sortie.write(b"0000000000 65535 f \n")
        for offset in offsets[1:]:
            sortie.write(f"{offset:010d} 00000 n \n".encode())
        sortie.write(
            b"trailer\n<< /Size " + str(len(objets) + 1).encode()
            + b" /Root " + str(ref_catalogue).encode() + b" 0 R"
            + b" /Info " + str(ref_info).encode() + b" 0 R >>\nstartxref\n"
            + str(depart_xref).encode() + b"\n%%EOF\n"
        )
        open(chemin, "wb").write(sortie.getvalue())
