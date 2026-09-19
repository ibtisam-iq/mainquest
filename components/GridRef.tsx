import type { CoreOffice } from '../lib/payload.ts';
import { cityCode } from '../lib/city-codes.ts';
import type { Lookups } from './types.ts';

const PRECISION_TEXT = {
  street: 'Placed at street level',
  area: 'Placed within the area',
  city: 'Only the city is known',
} as const;

// Street-level offices get a decimal. An area-level office sits at its area's centre, so its
// distance is only good to about a kilometre and is shown that way.
export function formatKm(km: number, precision: CoreOffice['precision']): string {
  if (precision === 'street') return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
  return km < 1 ? '< 1 km' : `≈ ${Math.round(km)} km`;
}

// A map-style grid reference for an office. The marker and border show how precisely it is placed.
export function GridRef({ office, lookups, km, more }: { office: CoreOffice; lookups: Lookups; km?: number | null; more?: number }) {
  const code = cityCode(office.city);
  const area = office.area ? lookups.area.get(office.area)?.label : null;
  const city = lookups.city.get(office.city)?.label ?? office.city;
  const title = `${area ? `${area}, ` : ''}${city}. ${PRECISION_TEXT[office.precision]}.`;
  return (
    <span className="gridref" data-precision={office.precision} title={title}>
      <span className="gridref__dot" aria-hidden="true" />
      <span className="sr-only">{title}</span>
      <span className="gridref__code" aria-hidden="true">{code}</span>
      {area && <span className="gridref__area" aria-hidden="true">{area}</span>}
      {km != null && <span className="gridref__km">{formatKm(km, office.precision)}</span>}
      {more ? <span className="gridref__more" aria-label={`and ${more} more offices`}>+{more}</span> : null}
    </span>
  );
}
