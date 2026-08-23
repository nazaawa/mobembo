import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Outfit } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
// Titraille de l'accueil passager uniquement : le POS, le contrôle et le
// back-office restent en Geist seul pour la densité et la lisibilité debout.
const outfit = Outfit({ variable: "--font-outfit", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Mobembo — billetterie bus RDC",
  description:
    "Plateforme de billetterie interurbaine : vente au guichet, réservation en ligne, " +
    "Mobile Money, billet QR, embarquement hors-ligne.",
  applicationName: "Mobembo",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Le POS et le terminal contrôleur se manipulent au doigt : le zoom reste
  // possible, mais la mise en page ne doit jamais dépendre de lui.
  maximumScale: 5,
};

/**
 * §3.1 : « i18n : français par défaut, lingala et swahili prévus dans
 * l'architecture dès le départ, même sans traduction en v1. »
 */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable} ${outfit.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col overflow-x-clip">{children}</body>
    </html>
  );
}
