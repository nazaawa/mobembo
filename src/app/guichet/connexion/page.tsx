import { Card, Why } from "@/components/ui";
import { FormulaireConnexion } from "./formulaire";

export const dynamic = "force-dynamic";

export default function ConnexionGuichet() {
  return (
    <div className="mx-auto max-w-md space-y-4 py-6">
      <Card title="Connexion agent" subtitle="Guichet, gérance, contrôle et back-office.">
        <FormulaireConnexion />
      </Card>
      <Why>
        Un agent peut cumuler plusieurs rôles — un gérant est souvent aussi guichetier — mais
        jamais dans la même session. Chaque bascule de rôle est enregistrée au journal d&apos;audit.
      </Why>
    </div>
  );
}
