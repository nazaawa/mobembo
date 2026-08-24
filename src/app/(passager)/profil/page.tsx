import { currentSession } from "@/lib/auth/session";
import { Card } from "@/components/ui";
import { ConnexionPassager } from "../mes-billets/connexion";
import { DeconnexionPassager } from "../deconnexion-bouton";

export const dynamic = "force-dynamic";

export default async function ProfilPassager() {
  const session = await currentSession();

  if (!session || session.activeRole !== "PASSAGER") {
    return (
      <Card title="Votre profil" subtitle="Connectez-vous avec votre numéro de téléphone.">
        <ConnexionPassager />
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-semibold tracking-tight">Profil</h1>

      <Card title="Votre session">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm text-texte-doux">
            <span className="h-1.5 w-1.5 rounded-full bg-succes" aria-hidden />
            Connecté avec <span className="font-semibold text-navy">{session.phone}</span>
          </div>
          <DeconnexionPassager className="inline-flex min-h-11 items-center gap-1.5 rounded-[10px] border border-bordure px-3.5 font-semibold text-navy transition-colors duration-300 ease-depart hover:border-accent hover:text-accent" />
        </div>
      </Card>
    </div>
  );
}
