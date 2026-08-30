import { handler, body } from "@/lib/api/handler";
import { createReservation } from "@/lib/domain/reservations";

/**
 * POST /api/reservations-horaire — Phase 2, §10.2 « Réserver une place ».
 *
 * Volontairement ouvert sans connexion préalable : la phase 2 ne délivre ni
 * billet ni paiement, et exiger un OTP avant même de réserver ajouterait une
 * étape à un parcours dont tout l'intérêt est d'en avoir peu (§31 « peu
 * d'étapes »). L'identité se vérifie là où elle sert vraiment — retrouver ses
 * réservations sur `/mes-reservations`, protégé par OTP. Le SMS de
 * confirmation part sur le numéro saisi, qui est donc bien vérifié en
 * pratique : sans accès à ce téléphone, la réservation reste inutilisable.
 */
export const POST = handler(async ({ request }) => {
  const input = await body<{
    horaireId: string;
    date: string;
    nom: string;
    telephone: string;
    places: number;
    note?: string;
  }>(request);

  const reservation = await createReservation({
    scheduleId: input.horaireId,
    travelDate: input.date,
    passengerName: input.nom,
    passengerPhone: input.telephone,
    seats: Number(input.places),
    note: input.note,
  });

  return { reservation };
});
