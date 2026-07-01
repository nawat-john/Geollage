export interface TourStop {
  timeMa: number;
  title: string;
  caption: string;
}

// A scripted walk from deep time to present, hitting the same well-known
// supercontinent events as EPOCHS but with teaching captions. Ages are
// approximate and model-independent, meant to orient a newcomer rather than
// stand in for a citation.
export const TOUR_STOPS: TourStop[] = [
  {
    timeMa: 1100,
    title: "Rodinia",
    caption:
      "Most continents are welded into a single supercontinent, Rodinia. Plate boundaries " +
      "you see today didn't exist yet — this is close to the oldest reconstruction this model covers.",
  },
  {
    timeMa: 900,
    title: "Rodinia breaks apart",
    caption:
      "Rodinia begins to rift apart, opening new oceans between the pieces that will eventually " +
      "become today's continents.",
  },
  {
    timeMa: 600,
    title: "Gondwana assembles",
    caption:
      "Many of the southern-hemisphere fragments collide and weld together into Gondwana — " +
      "the ancestor of Africa, South America, Antarctica, Australia and India.",
  },
  {
    timeMa: 320,
    title: "Pangaea",
    caption:
      "Gondwana collides with the northern continents to form Pangaea, the most recent " +
      "supercontinent — nearly all of Earth's land in one mass.",
  },
  {
    timeMa: 180,
    title: "Pangaea breaks apart",
    caption:
      "Pangaea begins to rift. The opening Atlantic Ocean starts separating the Americas " +
      "from Africa and Eurasia — a split that continues today.",
  },
  {
    timeMa: 0,
    title: "Present day",
    caption:
      "The plate mosaic you'd recognize on a map. Scrub the timeline yourself to watch any " +
      "part of this journey again, or switch to Sandbox to cut and drag plates by hand.",
  },
];
