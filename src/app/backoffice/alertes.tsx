"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** §2.11 : une alerte se prend en compte explicitement, jamais en silence. */
export function AcquitterAlerte({ alerteId }: { alerteId: string }) {
  const router = useRouter();
  const [occupe, setOccupe] = useState(false);

  return (
    <button
      type="button"
      className="rounded-lg border border-alerte/40 px-3 py-1.5 text-xs font-medium text-alerte hover:bg-alerte/10"
      disabled={occupe}
      onClick={async () => {
        setOccupe(true);
        await fetch("/api/backoffice/alertes", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ alerteId }),
        });
        router.refresh();
        setOccupe(false);
      }}
    >
      Prise en compte
    </button>
  );
}
