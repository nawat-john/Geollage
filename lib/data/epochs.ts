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
];
