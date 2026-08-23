import QRCode from "qrcode";

/**
 * QR rendu côté serveur en SVG inline : aucun script client, aucune requête
 * réseau supplémentaire. Le billet reste affichable sur un téléphone qui a
 * perdu la connexion après le chargement de la page.
 */
export async function QrCode({
  payload,
  size = 220,
}: {
  payload: string;
  size?: number;
}) {
  const svg = await QRCode.toString(payload, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 1,
    width: size,
    color: { dark: "#000000", light: "#ffffff" },
  });

  return (
    <div
      className="inline-block rounded-xl bg-white p-3"
      // Le SVG provient de la bibliothèque QR appliquée à un payload signé par
      // le serveur : il ne contient aucune entrée utilisateur libre.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
