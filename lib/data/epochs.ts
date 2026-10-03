export interface Epoch {
  timeMa: number;
  label: string;
}

// Approximate ages of well-known supercontinent / ocean events, for
// orientation on the timeline. Not tied to any single reconstruction model.
export const EPOCHS: Epoch[] = [
  { timeMa: 0, label: "Present" },
  { timeMa: 180, label: "Pangaea breakup" },
  { timeMa: 320, label: "Pangaea assembly" },
  { timeMa: 600, label: "Gondwana assembly" },
  { timeMa: 620, label: "Pannotia" },
  { timeMa: 900, label: "Rodinia breakup" },
  { timeMa: 1100, label: "Rodinia assembly" },
  { timeMa: 1800, label: "Columbia (Nuna)" },
];

export interface Period {
  name: string;
  startMa: number; // older bound
  endMa: number; // younger bound
  color: string; // ICS chart color
}

// ICS geologic periods (Phanerozoic + Proterozoic) covering the model's
// 0–1800 Ma span, with the International Chronostratigraphic Chart colors.
export const PERIODS: Period[] = [
  { name: "Quaternary", startMa: 2.58, endMa: 0, color: "#F9F97F" },
  { name: "Neogene", startMa: 23.03, endMa: 2.58, color: "#FFE619" },
  { name: "Paleogene", startMa: 66, endMa: 23.03, color: "#FD9A52" },
  { name: "Cretaceous", startMa: 145, endMa: 66, color: "#7FC64E" },
  { name: "Jurassic", startMa: 201.4, endMa: 145, color: "#34B2C9" },
  { name: "Triassic", startMa: 251.9, endMa: 201.4, color: "#812B92" },
  { name: "Permian", startMa: 298.9, endMa: 251.9, color: "#F04028" },
  { name: "Carboniferous", startMa: 358.9, endMa: 298.9, color: "#67A599" },
  { name: "Devonian", startMa: 419.2, endMa: 358.9, color: "#CB8C37" },
  { name: "Silurian", startMa: 443.8, endMa: 419.2, color: "#B3E1B6" },
  { name: "Ordovician", startMa: 485.4, endMa: 443.8, color: "#009270" },
  { name: "Cambrian", startMa: 538.8, endMa: 485.4, color: "#7FA056" },
  { name: "Ediacaran", startMa: 635, endMa: 538.8, color: "#FED96A" },
  { name: "Cryogenian", startMa: 720, endMa: 635, color: "#FECC5C" },
  { name: "Tonian", startMa: 1000, endMa: 720, color: "#FEBF4E" },
  { name: "Stenian", startMa: 1200, endMa: 1000, color: "#FED99A" },
  { name: "Ectasian", startMa: 1400, endMa: 1200, color: "#FDCC8A" },
  { name: "Calymmian", startMa: 1600, endMa: 1400, color: "#FDC07A" },
  { name: "Statherian", startMa: 1800, endMa: 1600, color: "#F875A7" },
];

export function periodAt(timeMa: number): Period | undefined {
  return PERIODS.find((p) => timeMa <= p.startMa && timeMa >= p.endMa);
}

/** The well-known event closest to `timeMa`, if within `withinMa`. */
export function nearbyEpoch(timeMa: number, withinMa = 15): Epoch | undefined {
  let best: Epoch | undefined;
  for (const e of EPOCHS) {
    const d = Math.abs(e.timeMa - timeMa);
    if (d <= withinMa && (!best || d < Math.abs(best.timeMa - timeMa))) best = e;
  }
  return best;
}
