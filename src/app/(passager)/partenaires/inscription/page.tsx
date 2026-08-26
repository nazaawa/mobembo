import Link from "next/link";
import { Card } from "@/components/ui";
import { FormulairePartenaire } from "./formulaire";

export const metadata = {
  title: "Devenir partenaire | Mobembo",
  description: "Inscrivez votre compagnie et gérez vos agences, destinations et départs.",
};

export default function InscriptionPartenaire() {
  const etapes = [
    "Envoyez votre demande",
    "Mobembo vérifie votre activité",
    "Recevez votre accès direction",
    "Ajoutez agences, lignes, bus et départs",
  ];
  return (
    <div className="mx-auto max-w-5xl pb-12">
      <div className="mb-8 max-w-3xl">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-accent">Espace partenaires</p>
        <h1 className="mt-2 font-heading text-4xl font-bold tracking-tight text-navy sm:text-5xl">Faites entrer votre compagnie sur Mobembo.</h1>
        <p className="mt-4 text-base leading-7 text-texte-doux">Après validation, votre direction pourra créer ses agences, ajouter ses destinations, enregistrer ses bus et publier ses départs.</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_1.6fr]">
        <aside className="space-y-5 rounded-[16px] bg-navy p-6 text-white">
          <h2 className="font-heading text-xl font-bold">Le parcours partenaire</h2>
          <ol className="space-y-4 text-sm text-white/75">
            {etapes.map((label, index) => <li key={label} className="flex gap-3"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/10 font-bold text-white">{index + 1}</span><span className="pt-1">{label}</span></li>)}
          </ol>
          <p className="border-t border-white/10 pt-4 text-xs text-white/55">Déjà partenaire ? <Link href="/guichet/connexion" className="font-semibold text-white hover:underline">Se connecter</Link></p>
        </aside>
        <Card title="Demande d'inscription" subtitle="Les informations servent à vérifier votre activité."><FormulairePartenaire /></Card>
      </div>
    </div>
  );
}
