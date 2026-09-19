// A small dot map of where a city's companies are: each placed office is binned to a few hundred metres
// and drawn as a dot sized by how many offices share the bin. Built on the server when pages are
// rendered, from the same office positions the map and distances use, and sent as plain SVG numbers.

export interface PlacedPoint {
  lat: number;
  lon: number;
}

export interface Constellation {
  width: number;
  height: number;
  // x, y and radius, rounded to one decimal to keep the markup small.
  dots: [number, number, number][];
  // City centres, drawn as small crosshairs so the dots have a point of reference.
  marks: [number, number][];
  // Names written beside the centres that carry one: position, text, and which side of the point.
  labels: [number, number, string, 'start' | 'end'][];
}

export interface Centre extends PlacedPoint {
  label?: string;
}

interface Options {
  width: number;
  height: number;
  pad?: number;
  // Bin size in degrees; 0.004 is about 400 m.
  bin?: number;
  // The share of points trimmed from each edge, so one far office does not shrink the city to a speck.
  trim?: number;
  maxRadius?: number;
  // A lone office's radius, and how fast a dot grows with the offices it holds.
  minRadius?: number;
  growth?: number;
  // Size dots against the fullest one instead, so the largest is always maxRadius.
  fit?: boolean;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))));
  return sorted[i];
}

export function constellation(points: readonly PlacedPoint[], opts: Options, centres: readonly Centre[] = []): Constellation {
  const { width, height, pad = 8, bin = 0.004, trim = 0.02, maxRadius = 5, minRadius = 1.1, growth = 0.75, fit = false } = opts;
  if (points.length === 0) return { width, height, dots: [], marks: [], labels: [] };

  const lats = points.map((p) => p.lat).sort((a, b) => a - b);
  const lons = points.map((p) => p.lon).sort((a, b) => a - b);
  let minLat = quantile(lats, trim), maxLat = quantile(lats, 1 - trim);
  let minLon = quantile(lons, trim), maxLon = quantile(lons, 1 - trim);
  // A single spot still needs an area to sit in.
  if (maxLat - minLat < 0.01) { const c = (minLat + maxLat) / 2; minLat = c - 0.005; maxLat = c + 0.005; }
  if (maxLon - minLon < 0.01) { const c = (minLon + maxLon) / 2; minLon = c - 0.005; maxLon = c + 0.005; }

  const bins = new Map<string, { lat: number; lon: number; n: number }>();
  for (const p of points) {
    if (p.lat < minLat || p.lat > maxLat || p.lon < minLon || p.lon > maxLon) continue;
    const key = `${Math.round(p.lat / bin)},${Math.round(p.lon / bin)}`;
    const b = bins.get(key);
    if (b) b.n += 1;
    else bins.set(key, { lat: Math.round(p.lat / bin) * bin, lon: Math.round(p.lon / bin) * bin, n: 1 });
  }

  // Equirectangular, with longitude shortened by the latitude so the city keeps its shape.
  const k = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const spanX = (maxLon - minLon) * k;
  const spanY = maxLat - minLat;
  const scale = Math.min((width - 2 * pad) / spanX, (height - 2 * pad) / spanY);
  const offX = (width - spanX * scale) / 2;
  const offY = (height - spanY * scale) / 2;

  const x = (lon: number) => round1(offX + (lon - minLon) * k * scale);
  const y = (lat: number) => round1(offY + (maxLat - lat) * scale);
  const fullest = Math.max(...[...bins.values()].map((b) => b.n));
  const radius = (n: number) =>
    fit ? minRadius + (maxRadius - minRadius) * Math.sqrt((n - 1) / Math.max(1, fullest - 1)) : Math.min(maxRadius, minRadius + growth * Math.sqrt(n - 1));
  const dots: [number, number, number][] = [...bins.values()]
    .sort((a, b) => a.n - b.n || a.lat - b.lat || a.lon - b.lon)
    .map((b) => [x(b.lon), y(b.lat), round1(radius(b.n))]);
  const inside = centres.filter((c) => c.lat >= minLat && c.lat <= maxLat && c.lon >= minLon && c.lon <= maxLon);
  const marks = inside.map((c): [number, number] => [x(c.lon), y(c.lat)]);
  // A name sits clear of the dot under it, on the right unless another named point is close on that side.
  const named = inside.filter((c) => c.label).map((c) => ({ x: x(c.lon), y: y(c.lat), text: c.label as string }));
  const labels = named.map((c): [number, number, string, 'start' | 'end'] => {
    const under = dots.filter(([dx, dy]) => Math.hypot(dx - c.x, dy - c.y) < 12).reduce((r, d) => Math.max(r, d[2]), 0);
    const gap = Math.max(under, 5) + 5;
    const crowded = named.some((o) => o !== c && o.x > c.x && o.x - c.x < 150 && Math.abs(o.y - c.y) < 30);
    return crowded ? [round1(c.x - gap), round1(c.y + 4), c.text, 'end'] : [round1(c.x + gap), round1(c.y + 4), c.text, 'start'];
  });
  return { width, height, dots, marks, labels };
}
