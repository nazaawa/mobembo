"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** §2.5.4 : OTP par SMS côté connexion ; ce bouton ferme la session ouverte par ce flux. */
export function DeconnexionPassager({
  className,
  iconOnly = false,
}: {
  className?: string;
  iconOnly?: boolean;
}) {
  const router = useRouter();
  const [occupe, setOccupe] = useState(false);

  return (
    <button
      type="button"
      disabled={occupe}
      aria-label={iconOnly ? "Se déconnecter" : undefined}
      className={className}
      onClick={async () => {
        setOccupe(true);
        await fetch("/api/auth/deconnexion", { method: "POST" });
        router.push("/");
        router.refresh();
      }}
    >
      <LogoutIcon />
      {!iconOnly && "Se déconnecter"}
    </button>
  );
}

function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 4H9a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h6" />
      <path d="M10 12h10m0 0-3.5-3.5M20 12l-3.5 3.5" />
    </svg>
  );
}
