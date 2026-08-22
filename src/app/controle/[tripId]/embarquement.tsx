"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  Badge,
  Stat,
  Table,
  Why,
  inputClass,
  buttonClass,
  buttonSecondaryClass,
  buttonDangerClass,
} from "@/components/ui";
import { formatTime } from "@/lib/core/time";
import { verifierQrLocalement, lireQr } from "@/lib/client/qr-verify";
import {
  ecrireManifeste,
  enregistrerScan,
  scansLocaux,
  premierScanLocal,
  marquerScansSynchronises,
  nouvelOpId,
  terminalId,
  type ManifesteLocal,
  type ScanLocal,
} from "@/lib/client/manifeste";
import { useStockageLocal } from "@/lib/client/store";

const AUCUN_SCAN: ScanLocal[] = [];

type Verdict =
  | { type: "ACCEPTE"; siege: string; passager: string; code: string }
  | { type: "DEJA_SCANNE"; siege: string; passager: string; heure: string }
  | { type: "REFUSE"; motif: string; detail?: string; nouveauTitulaire?: string };

/**
 * §2.7 Embarquement.
 *
 * Le scan est validé **localement** : signature HMAC vérifiée avec la clé du
 * manifeste, anti-rejeu par la liste des scans du terminal. Le réseau ne sert
 * qu'à remonter les scans après coup. Un contrôleur qui attend une réponse
 * serveur à chaque passager bloque la file d'embarquement.
 */
export function Embarquement({
  manifeste,
  departEffectif,
  manifesteClos,
}: {
  manifeste: ManifesteLocal;
  departEffectif: string | null;
  manifesteClos: string | null;
}) {
  const router = useRouter();
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [saisie, setSaisie] = useState("");
  const [camera, setCamera] = useState(false);
  const [cameraErreur, setCameraErreur] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const champRef = useRef<HTMLInputElement | null>(null);

  const lireScans = useCallback(() => scansLocaux(manifeste.tripId), [manifeste.tripId]);
  const scans = useStockageLocal(lireScans, AUCUN_SCAN);

  // Le manifeste rendu par le serveur fait référence ; il est recopié dans le
  // cache du terminal pour rester utilisable après une coupure.
  useEffect(() => {
    ecrireManifeste(manifeste);
  }, [manifeste]);

  /** §2.7 : remontée des scans au retour du réseau. */
  const synchroniser = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.onLine) return;
    const enAttente = scansLocaux(manifeste.tripId).filter((scan) => !scan.synchronise);
    if (enAttente.length === 0) return;
    try {
      const response = await fetch("/api/controle/synchronisation", {
        method: "POST",
        headers: { "content-type": "application/json", "x-mobembo-device": terminalId() },
        body: JSON.stringify({
          tripId: manifeste.tripId,
          scans: enAttente.map((scan) => ({
            clientOpId: scan.clientOpId,
            rawQr: scan.rawQr,
            clientTime: scan.clientTime,
          })),
        }),
      });
      if (!response.ok) return;
      marquerScansSynchronises(enAttente.map((scan) => scan.clientOpId));
      router.refresh();
    } catch {
      /* toujours hors-ligne : la file reste intacte */
    }
  }, [manifeste.tripId, router]);

  const traiter = useCallback(
    async (brut: string) => {
      const nettoye = brut.trim();
      if (!nettoye) return;

      // Un code billet tapé à la main est accepté en secours quand le QR est
      // illisible — écran cassé, papier froissé, téléphone déchargé.
      const entreeParCode = manifeste.entries.find(
        (entree) => entree.ticketCode.toUpperCase() === nettoye.toUpperCase(),
      );
      const payload = entreeParCode
        ? { ticketId: entreeParCode.ticketId, tripId: manifeste.tripId, seat: entreeParCode.seat }
        : lireQr(nettoye);

      if (!payload) {
        setVerdict({ type: "REFUSE", motif: "QR illisible ou étranger à Mobembo." });
        return;
      }

      if (!entreeParCode) {
        const verification = await verifierQrLocalement(nettoye, [manifeste.cleVerification]);
        if (!verification.valide) {
          setVerdict({
            type: "REFUSE",
            motif:
              verification.raison === "FORMAT"
                ? "QR illisible ou étranger à Mobembo."
                : "Signature invalide — ce billet n'a pas été émis par cette compagnie.",
          });
          enregistrerScan({
            clientOpId: nouvelOpId(),
            tripId: manifeste.tripId,
            ticketId: null,
            rawQr: nettoye,
            clientTime: new Date().toISOString(),
            resultat: "REFUSE",
            motif: "signature",
            synchronise: false,
          });
          return;
        }
      }

      if (payload.tripId !== manifeste.tripId) {
        setVerdict({ type: "REFUSE", motif: "Ce billet appartient à un autre voyage." });
        return;
      }

      const entree = manifeste.entries.find((e) => e.ticketId === payload.ticketId);
      if (!entree) {
        setVerdict({
          type: "REFUSE",
          motif: "Billet absent du manifeste. Retéléchargez-le si vous avez du réseau.",
        });
        return;
      }

      // §2.7 : un billet revendu ou transféré est refusé avec le nom du
      // nouveau titulaire — le contrôleur doit pouvoir expliquer le refus.
      if (entree.invalide) {
        setVerdict({
          type: "REFUSE",
          motif: entree.motifInvalidite ?? `Billet ${entree.status}.`,
          detail: `Siège ${entree.seat} — ancien titulaire ${entree.passengerName}.`,
          nouveauTitulaire: entree.nouveauTitulaire,
        });
        enregistrerScan({
          clientOpId: nouvelOpId(),
          tripId: manifeste.tripId,
          ticketId: entree.ticketId,
          rawQr: nettoye,
          clientTime: new Date().toISOString(),
          resultat: "REFUSE",
          motif: entree.motifInvalidite,
          synchronise: false,
        });
        return;
      }

      // Anti-rejeu : le premier scan a marqué le billet localement, le
      // manifeste porte ceux enregistrés côté serveur.
      const dejaLocal = premierScanLocal(manifeste.tripId, entree.ticketId);
      const heurePremierScan = dejaLocal?.clientTime ?? entree.dejaScanneA;
      if (heurePremierScan) {
        setVerdict({
          type: "DEJA_SCANNE",
          siege: entree.seat,
          passager: entree.passengerName,
          heure: heurePremierScan,
        });
        enregistrerScan({
          clientOpId: nouvelOpId(),
          tripId: manifeste.tripId,
          ticketId: entree.ticketId,
          rawQr: nettoye,
          clientTime: new Date().toISOString(),
          resultat: "DEJA_SCANNE",
          synchronise: false,
        });
        return;
      }

      enregistrerScan({
        clientOpId: nouvelOpId(),
        tripId: manifeste.tripId,
        ticketId: entree.ticketId,
        rawQr: nettoye,
        clientTime: new Date().toISOString(),
        resultat: "ACCEPTE",
        synchronise: false,
      });
      setVerdict({
        type: "ACCEPTE",
        siege: entree.seat,
        passager: entree.passengerName,
        code: entree.ticketCode,
      });
      void synchroniser();
    },
    [manifeste, synchroniser],
  );

  // Effet légitime : il pousse l'état local vers un système extérieur — le
  // serveur — plutôt que de recopier un état React dans un autre.
  useEffect(() => {
    const onOnline = () => void synchroniser();
    window.addEventListener("online", onOnline);
    const interval = setInterval(() => void synchroniser(), 30_000);
    return () => {
      window.removeEventListener("online", onOnline);
      clearInterval(interval);
    };
  }, [synchroniser]);

  /**
   * Caméra : `BarcodeDetector` est disponible sur Chrome Android 90+ et la
   * WebView système, les cibles de §3.4. Là où il manque, la saisie manuelle du
   * code billet prend le relais — l'embarquement ne s'arrête jamais.
   */
  useEffect(() => {
    if (!camera) return;
    let flux: MediaStream | null = null;
    let actif = true;

    const demarrer = async () => {
      const Detector = (
        window as unknown as {
          BarcodeDetector?: new (options: { formats: string[] }) => {
            detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>>;
          };
        }
      ).BarcodeDetector;

      if (!Detector) {
        setCameraErreur(
          "Ce terminal ne sait pas décoder les QR par la caméra. Saisissez le code du billet.",
        );
        setCamera(false);
        return;
      }

      try {
        flux = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (!actif) return;
        if (videoRef.current) {
          videoRef.current.srcObject = flux;
          await videoRef.current.play();
        }
      } catch {
        setCameraErreur("Accès caméra refusé. Saisissez le code du billet à la main.");
        setCamera(false);
        return;
      }

      const detecteur = new Detector({ formats: ["qr_code"] });
      const boucle = async () => {
        if (!actif || !videoRef.current) return;
        try {
          const codes = await detecteur.detect(videoRef.current);
          if (codes[0]?.rawValue) await traiter(codes[0].rawValue);
        } catch {
          /* image illisible : on réessaie à la trame suivante */
        }
        if (actif) setTimeout(() => void boucle(), 400);
      };
      void boucle();
    };

    void demarrer();

    return () => {
      actif = false;
      flux?.getTracks().forEach((piste) => piste.stop());
    };
  }, [camera, traiter]);

  const embarques = useMemo(
    () => scans.filter((scan) => scan.resultat === "ACCEPTE").length,
    [scans],
  );
  const enAttente = useMemo(() => scans.filter((scan) => !scan.synchronise).length, [scans]);
  const valides = useMemo(() => manifeste.entries.filter((e) => !e.invalide), [manifeste]);
  const scannes = useMemo(
    () =>
      new Set(
        scans.filter((scan) => scan.resultat === "ACCEPTE").map((scan) => scan.ticketId ?? ""),
      ),
    [scans],
  );

  return (
    <div className="space-y-4">
      {verdict && <PanneauVerdict verdict={verdict} onFermer={() => setVerdict(null)} />}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Billets valides" value={valides.length} />
        <Stat label="Embarqués" value={embarques} tone="succes" />
        <Stat label="Restants" value={Math.max(0, valides.length - embarques)} />
        <Stat
          label="À synchroniser"
          value={enAttente}
          tone={enAttente > 0 ? "attention" : "neutre"}
        />
      </div>

      <Card title="Scanner un billet">
        <div className="space-y-3">
          {camera ? (
            <div className="space-y-2">
              <video
                ref={videoRef}
                className="w-full max-w-sm rounded-xl border border-bordure bg-black"
                playsInline
                muted
              />
              <button
                type="button"
                className={buttonSecondaryClass}
                onClick={() => setCamera(false)}
              >
                Arrêter la caméra
              </button>
            </div>
          ) : (
            <button type="button" className={buttonClass} onClick={() => setCamera(true)}>
              Ouvrir la caméra
            </button>
          )}

          {cameraErreur && (
            <p className="rounded-lg border border-attention/40 bg-attention-doux px-3 py-2 text-sm text-attention">
              {cameraErreur}
            </p>
          )}

          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void traiter(saisie);
              setSaisie("");
              champRef.current?.focus();
            }}
          >
            <input
              ref={champRef}
              className={`${inputClass} font-mono uppercase`}
              value={saisie}
              onChange={(e) => setSaisie(e.target.value)}
              placeholder="Code du billet, ex. ACDE-F345"
              aria-label="Code du billet"
            />
            <button type="submit" className={buttonSecondaryClass} disabled={!saisie.trim()}>
              Vérifier
            </button>
          </form>

          <Why>
            La vérification se fait sur ce terminal, sans réseau : la signature du QR est
            recalculée avec la clé de la compagnie téléchargée avec le manifeste. Un second passage
            du même billet est refusé même hors connexion.
          </Why>
        </div>
      </Card>

      <ActionsVoyage
        tripId={manifeste.tripId}
        departEffectif={departEffectif}
        manifesteClos={manifesteClos}
        enAttente={enAttente}
        onSynchroniser={() => void synchroniser()}
      />

      <Card title="Manifeste" subtitle={`${manifeste.entries.length} billet(s) émis sur ce départ`}>
        <Table headers={["Siège", "Passager", "Code", "État"]}>
          {manifeste.entries.map((entree) => (
            <tr key={entree.ticketId} className={entree.invalide ? "opacity-60" : ""}>
              <td className="px-2 py-1.5 font-medium tabular-nums">{entree.seat}</td>
              <td className="px-2 py-1.5">
                {entree.passengerName}
                {entree.nouveauTitulaire && (
                  <div className="text-[11px] text-attention">
                    désormais : {entree.nouveauTitulaire}
                  </div>
                )}
              </td>
              <td className="px-2 py-1.5 font-mono text-xs">{entree.ticketCode}</td>
              <td className="px-2 py-1.5">
                {entree.invalide ? (
                  <Badge tone="alerte">{entree.motifInvalidite ?? entree.status}</Badge>
                ) : scannes.has(entree.ticketId) || entree.dejaScanneA ? (
                  <Badge tone="succes">embarqué</Badge>
                ) : (
                  <Badge tone="neutre">attendu</Badge>
                )}
              </td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}

/** Verdict plein écran : lisible en une fraction de seconde, à bout de bras. */
function PanneauVerdict({ verdict, onFermer }: { verdict: Verdict; onFermer: () => void }) {
  const styles = {
    ACCEPTE: "border-succes bg-succes-doux text-succes",
    DEJA_SCANNE: "border-alerte bg-alerte-doux text-alerte",
    REFUSE: "border-alerte bg-alerte-doux text-alerte",
  } as const;

  return (
    <div
      className={`rounded-xl border-2 px-4 py-4 ${styles[verdict.type]}`}
      role="alert"
      aria-live="assertive"
    >
      {verdict.type === "ACCEPTE" && (
        <>
          <p className="text-2xl font-bold">EMBARQUEMENT AUTORISÉ</p>
          <p className="mt-1 text-lg">
            Siège <strong>{verdict.siege}</strong> — {verdict.passager}
          </p>
          <p className="mt-0.5 font-mono text-sm">{verdict.code}</p>
        </>
      )}
      {verdict.type === "DEJA_SCANNE" && (
        <>
          <p className="text-2xl font-bold">DÉJÀ SCANNÉ à {formatTime(verdict.heure)}</p>
          <p className="mt-1 text-lg">
            Siège <strong>{verdict.siege}</strong> — {verdict.passager}
          </p>
          <p className="mt-1 text-sm">
            Ce billet est déjà passé. Vérifiez qu&apos;il ne s&apos;agit pas d&apos;une copie.
          </p>
        </>
      )}
      {verdict.type === "REFUSE" && (
        <>
          <p className="text-2xl font-bold">REFUSÉ</p>
          <p className="mt-1 text-lg">{verdict.motif}</p>
          {verdict.detail && <p className="mt-1 text-sm">{verdict.detail}</p>}
          {verdict.nouveauTitulaire && (
            <p className="mt-1.5 rounded-lg bg-surface px-3 py-2 text-sm">
              Ce siège appartient désormais à <strong>{verdict.nouveauTitulaire}</strong>.
            </p>
          )}
        </>
      )}
      <button
        type="button"
        className="mt-3 rounded-lg border border-current px-4 py-2 text-sm font-medium"
        onClick={onFermer}
        autoFocus
      >
        Passager suivant
      </button>
    </div>
  );
}

/** Départ effectif et clôture du manifeste (§2.9). */
function ActionsVoyage({
  tripId,
  departEffectif,
  manifesteClos,
  enAttente,
  onSynchroniser,
}: {
  tripId: string;
  departEffectif: string | null;
  manifesteClos: string | null;
  enAttente: number;
  onSynchroniser: () => void;
}) {
  const router = useRouter();
  const [occupe, setOccupe] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  const appeler = async (chemin: string) => {
    setOccupe(true);
    setErreur(null);
    try {
      const response = await fetch(chemin, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Action impossible.");
      return data;
    } catch (error) {
      setErreur((error as Error).message);
      return null;
    } finally {
      setOccupe(false);
    }
  };

  return (
    <Card title="Fin de voyage">
      {erreur && (
        <p className="mb-3 rounded-lg border border-alerte/40 bg-alerte-doux px-3 py-2 text-sm text-alerte">
          {erreur}
        </p>
      )}
      {message && (
        <p className="mb-3 rounded-lg border border-succes/40 bg-succes-doux px-3 py-2 text-sm text-succes">
          {message}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={buttonSecondaryClass}
          disabled={enAttente === 0 || occupe}
          onClick={onSynchroniser}
        >
          {enAttente > 0 ? `Synchroniser ${enAttente} scan(s)` : "Scans synchronisés"}
        </button>

        <button
          type="button"
          className={buttonClass}
          disabled={Boolean(departEffectif) || occupe}
          onClick={async () => {
            const data = await appeler(`/api/trajets/${tripId}/depart`);
            if (data) {
              setMessage("Départ effectif enregistré.");
              router.refresh();
            }
          }}
        >
          {departEffectif
            ? `Parti à ${formatTime(departEffectif)}`
            : "Enregistrer le départ effectif"}
        </button>

        <button
          type="button"
          className={buttonDangerClass}
          disabled={!departEffectif || Boolean(manifesteClos) || occupe}
          onClick={async () => {
            if (!confirm("Clôturer le manifeste ? Les billets non scannés passeront en no-show.")) {
              return;
            }
            onSynchroniser();
            const data = await appeler(`/api/trajets/${tripId}/cloture`);
            if (data) {
              setMessage(
                `Manifeste clôturé : ${data.embarques} embarqué(s), ${data.noShows} no-show(s), ` +
                  `remplissage ${Math.round(data.tauxRemplissage * 100)} %.`,
              );
              router.refresh();
            }
          }}
        >
          {manifesteClos ? "Manifeste clôturé" : "Clôturer le manifeste"}
        </button>
      </div>

      <div className="mt-3">
        <Why>
          Un billet reste valable jusqu&apos;à la clôture manuelle, même après l&apos;heure
          annoncée : un passager arrivé à 8 h 40 pour un bus annoncé à 8 h 00 mais parti à 8 h 45
          embarque normalement. C&apos;est le départ effectif qui fait foi, jamais l&apos;horaire.
        </Why>
      </div>
    </Card>
  );
}
