/** View state carried in a share link's #hash — small enough to paste
 * anywhere, and needs no server. Sandbox edits are deliberately left out:
 * those travel as exported project files. */
export interface ShareState {
  timeMa?: number;
  camera?: [number, number, number];
  pin?: { lon: number; lat: number; label: string };
}

const round = (n: number, digits: number) => Number(n.toFixed(digits));

export function encodeShareHash(s: ShareState): string {
  const params = new URLSearchParams();
  if (s.timeMa !== undefined) params.set("t", String(Math.round(s.timeMa)));
  if (s.camera) params.set("cam", s.camera.map((n) => round(n, 3)).join(","));
  if (s.pin) {
    params.set("pin", `${round(s.pin.lon, 3)},${round(s.pin.lat, 3)}`);
    if (s.pin.label) params.set("pinName", s.pin.label);
  }
  return `#${params.toString().replace(/%2C/g, ",")}`; // commas are URL-safe in a fragment
}

function numbers(value: string | null, count: number): number[] | undefined {
  if (!value) return undefined;
  const parts = value.split(",").map(Number);
  return parts.length === count && parts.every(Number.isFinite) ? parts : undefined;
}

/** Lenient: anything malformed is simply dropped rather than throwing. */
export function parseShareHash(hash: string): ShareState {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const out: ShareState = {};

  const t = Number(params.get("t"));
  if (params.has("t") && Number.isFinite(t)) out.timeMa = t;

  const cam = numbers(params.get("cam"), 3);
  const camDistance = cam ? Math.hypot(...cam) : 0;
  if (cam && camDistance > 1.2 && camDistance < 10) out.camera = cam as [number, number, number];

  const pin = numbers(params.get("pin"), 2);
  if (pin && Math.abs(pin[1]) <= 90) {
    out.pin = { lon: pin[0], lat: pin[1], label: (params.get("pinName") ?? "").slice(0, 40) };
  }
  return out;
}
