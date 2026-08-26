import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { currentSession } from "@/lib/auth/session";
import { buildManifest } from "@/lib/domain/boarding";
import { tripDetail } from "@/lib/domain/repo";
import { formatDateTime } from "@/lib/core/time";
import { Embarquement } from "./embarquement";

export const dynamic = "force-dynamic";

/** §2.7 Écran d'embarquement : manifeste + scan hors-ligne. */
export default async function PageControle(props: PageProps<"/controle/[tripId]">) {
  const { tripId } = await props.params;
  const session = await currentSession();
  if (!session || session.activeRole !== "CONTROLEUR") {
    redirect("/guichet/connexion");
  }

  let trip;
  try {
    trip = await tripDetail(tripId);
  } catch {
    notFound();
  }
  if (trip.company_id !== session.companyId || trip.origin_agency_id !== session.agencyId) notFound();

  const manifeste = await buildManifest(tripId);

  return (
    <div className="space-y-4">
      <div>
        <Link href="/controle" className="text-sm text-accent hover:underline">
          ← Départs à contrôler
        </Link>
        <h1 className="mt-1.5 text-xl font-semibold tracking-tight">{manifeste.ligne}</h1>
        <p className="mt-0.5 text-sm text-texte-doux">
          {formatDateTime(manifeste.depart)} · bus {manifeste.plaque} · {manifeste.compagnie}
        </p>
      </div>

      <Embarquement
        manifeste={manifeste}
        departEffectif={trip.departed_at}
        manifesteClos={trip.manifest_closed_at}
      />
    </div>
  );
}
