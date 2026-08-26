import test, { after } from "node:test";
import assert from "node:assert/strict";
import { closeDb } from "@/lib/db";
import { createSeatMap, createBus } from "@/lib/domain/planning";
import { getBus } from "@/lib/domain/repo";
import { LAYOUT_PRESETS } from "@/lib/domain/seat-map";
import { seedFixture } from "./helpers";

after(async () => closeDb());

test("Référentiel — createBus persiste le type de véhicule choisi", async () => {
  const fixture = await seedFixture();
  const seatMap = await createSeatMap({
    companyId: fixture.companyId,
    name: "Berline 4 places",
    rows: 1,
    layout: LAYOUT_PRESETS["Voiture — sans couloir"],
    disabledSeats: [],
  });
  const bus = await createBus({
    companyId: fixture.companyId,
    plateNumber: "TEST VX01",
    seatMapId: seatMap.id,
    category: "STANDARD",
    vehicleType: "VOITURE",
  });
  const row = await getBus(bus.id);
  assert.equal(row.vehicle_type, "VOITURE");
});

test("Référentiel — createBus sans type de véhicule reste BUS par défaut", async () => {
  const fixture = await seedFixture();
  // fixture.busId a été créé sans préciser vehicleType — vérifie la
  // rétrocompatibilité de tout code appelant existant.
  const row = await getBus(fixture.busId);
  assert.equal(row.vehicle_type, "BUS");
});
