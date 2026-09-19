// Distance on the Earth's surface, in kilometres, between two latitude and longitude pairs.
const EARTH_RADIUS_KM = 6371.0088;

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

// Pakistan's bounding box, used to reject coordinates that cannot belong to a Pakistani office.
export const PAKISTAN_BOUNDS = { minLat: 23.5, maxLat: 37.1, minLon: 60.8, maxLon: 77.8 } as const;

export function insidePakistan(lat: number, lon: number): boolean {
  const b = PAKISTAN_BOUNDS;
  return lat >= b.minLat && lat <= b.maxLat && lon >= b.minLon && lon <= b.maxLon;
}

export function round5(n: number): number {
  return Math.round(n * 1e5) / 1e5;
}
