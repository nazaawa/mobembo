"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field, inputClass, buttonClass, buttonSecondaryClass } from "@/components/ui";

/** §2.5.4 : « Pas de mot de passe : OTP par SMS. » */
export function ConnexionPassager() {
  const router = useRouter();
  const [telephone, setTelephone] = useState("");
  const [code, setCode] = useState("");
  const [envoye, setEnvoye] = useState(false);
  const [codeDemo, setCodeDemo] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);

  const appel = async (url: string, payload: unknown) => {
    setErreur(null);
    setOccupe(true);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "Erreur inattendue.");
      return data;
    } catch (error) {
      setErreur((error as Error).message);
      return null;
    } finally {
      setOccupe(false);
    }
  };

  return (
    <div className="space-y-3">
      {erreur && (
        <p className="rounded-lg border border-alerte/40 bg-alerte-doux px-3 py-2 text-sm text-alerte">
          {erreur}
        </p>
      )}

      <Field label="Votre téléphone">
        <input
          className={inputClass}
          inputMode="tel"
          value={telephone}
          onChange={(e) => setTelephone(e.target.value)}
          placeholder="081 234 5678"
        />
      </Field>

      {!envoye ? (
        <button
          type="button"
          className={buttonClass}
          disabled={!telephone || occupe}
          onClick={async () => {
            const data = await appel("/api/auth/otp/demande", { phone: telephone });
            if (data) {
              setEnvoye(true);
              setCodeDemo(data.codeDeveloppement ?? null);
            }
          }}
        >
          Recevoir un code par SMS
        </button>
      ) : (
        <>
          <Field
            label="Code reçu"
            hint={codeDemo ? `Environnement de démonstration — code : ${codeDemo}` : undefined}
          >
            <input
              className={`${inputClass} tracking-[0.4em]`}
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="000000"
            />
          </Field>
          <div className="flex gap-2">
            <button
              type="button"
              className={buttonClass}
              disabled={code.length < 6 || occupe}
              onClick={async () => {
                const data = await appel("/api/auth/otp/verification", {
                  phone: telephone,
                  code,
                });
                if (data) router.refresh();
              }}
            >
              Me connecter
            </button>
            <button
              type="button"
              className={buttonSecondaryClass}
              onClick={() => appel("/api/auth/otp/demande", { phone: telephone })}
            >
              Renvoyer
            </button>
          </div>
        </>
      )}
    </div>
  );
}
