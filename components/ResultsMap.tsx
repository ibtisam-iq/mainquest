'use client';

import { useEffect, useRef, useState } from 'react';
import { LngLatBounds, Map as MapView, NavigationControl, Popup, setWorkerUrl, type ExpressionSpecification, type GeoJSONSource } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { CoreRecord } from '../lib/payload.ts';
import { companyUrl } from '../lib/links.ts';
import type { Near } from '../lib/query.ts';
import type { Lookups } from './types.ts';
import { formatFollowers } from '../lib/format.ts';
import { useTheme } from './useTheme.ts';

interface Props {
  records: CoreRecord[];
  lookups: Lookups;
  near: Near | null;
  radiusKm: number;
  // The chosen areas and city hubs. The map frames their offices, and still draws offices elsewhere.
  areas: string[];
  hubs: string[];
  // Narrows the list to one area, from a marker's popup.
  onArea: (id: string) => void;
}

// The bundler moves the library away from its worker, so the worker is served from public/maplibre/,
// copied there by scripts/publish-map-worker.ts.
setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');

// OpenFreeMap: free vector tiles from OpenStreetMap data, with no key and no usage limit. One style for
// each theme; both use the same layers, so the English labels and the markers work on either.
const STYLE_URL = { light: 'https://tiles.openfreemap.org/styles/positron', dark: 'https://tiles.openfreemap.org/styles/dark' } as const;
const COLOURS = {
  light: { dot: '#19694b', halo: '#ffffff', ink: '#0f1f1a', label: '#ffffff' },
  dark: { dot: '#1fdc82', halo: '#0a0a0a', ink: '#fafafa', label: '#04110b' },
} as const;
// Shown in a popup before "and N more".
const POPUP_ROWS = 6;

// Place and street labels in English. The tiles carry each name in several forms: the English name where
// mapped, then a Latin-script form. A name held only in another script gets no label rather than one
// most visitors cannot read.
const ENGLISH_NAME: ExpressionSpecification = ['coalesce', ['get', 'name:en'], ['get', 'name_en'], ['get', 'name:latin'], ''];

type Point = [number, number];
type FeatureProps = Record<string, string | number>;
type FeatureCollection = GeoJSON.FeatureCollection<GeoJSON.Geometry, FeatureProps>;
// One marker per spot: every listed office at the same position, as [record index, office index].
type Stack = { lon: number; lat: number; precision: 'street' | 'area'; area: string | null; city: string; offices: [number, number][] };

// A circle on the ground, as a line, for the "within N km" ring.
function ring(lat: number, lon: number, km: number, steps = 96): Point[] {
  const out: Point[] = [];
  const dLat = km / 110.574;
  const dLon = km / (111.32 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    out.push([lon + dLon * Math.cos(a), lat + dLat * Math.sin(a)]);
  }
  return out;
}

// Only offices placed at street or area level are drawn. A city-level office would sit on the city centre
// and suggest a position nobody knows. Area-level offices share their area's centre, so offices at one
// position become one marker that says how many it holds, and its popup lists them all.
function stacks(records: CoreRecord[]): Stack[] {
  const byPos = new Map<string, Stack>();
  records.forEach((r, ri) => {
    r.offices.forEach((o, oi) => {
      if (o.precision === 'city') return;
      const key = `${o.lon},${o.lat}`;
      let s = byPos.get(key);
      if (!s) {
        s = { lon: o.lon, lat: o.lat, precision: o.precision, area: o.area, city: o.city, offices: [] };
        byPos.set(key, s);
      }
      // A company with two offices at one spot is listed once.
      if (!s.offices.some(([r2]) => r2 === ri)) s.offices.push([ri, oi]);
    });
  });
  return [...byPos.values()];
}

function stackFeatures(list: Stack[]): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: list.map((s, i) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [s.lon, s.lat] }, properties: { s: i, n: s.offices.length, p: s.precision } })),
  };
}

function nearFeatures(near: Near | null, radiusKm: number): FeatureCollection {
  if (!near) return { type: 'FeatureCollection', features: [] };
  return {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', geometry: { type: 'LineString', coordinates: ring(near.lat, near.lon, radiusKm) }, properties: { kind: 'ring' } },
      { type: 'Feature', geometry: { type: 'Point', coordinates: [near.lon, near.lat] }, properties: { kind: 'point' } },
    ],
  };
}

export default function ResultsMap({ records, lookups, near, radiusKm, areas, hubs, onArea }: Props) {
  const theme = useTheme();
  const box = useRef<HTMLDivElement | null>(null);
  const map = useRef<MapView | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  // The click handler is registered once per map, so it reads the latest data through a ref.
  const current = useRef({ records, lookups, list: [] as Stack[], onArea });
  current.current.records = records;
  current.current.lookups = lookups;
  current.current.onArea = onArea;

  // The map is rebuilt when the theme changes, since each theme has its own style.
  useEffect(() => {
    if (!box.current) return;
    const colours = COLOURS[theme];
    let m: MapView;
    try {
      m = new MapView({ container: box.current, style: STYLE_URL[theme], center: [70.5, 30.4], zoom: 4.3, maxZoom: 18, attributionControl: { compact: false } });
    } catch {
      setFailed(true);
      return;
    }
    m.addControl(new NavigationControl({ showCompass: false }), 'top-right');
    // The styles name a few point-of-interest icons their sprites lack; a blank stands in for them.
    m.setMissingStyleImageResolver((id) => { if (!m.hasImage(id)) m.addImage(id, { width: 1, height: 1, data: new Uint8Array(4) }); });
    m.on('load', () => {
      for (const layer of m.getStyle().layers) {
        if (layer.type !== 'symbol') continue;
        const field = m.getLayoutProperty(layer.id, 'text-field');
        if (field && JSON.stringify(field).includes('name')) m.setLayoutProperty(layer.id, 'text-field', ENGLISH_NAME);
      }
      // Company markers and the ring sit beneath the map's labels, so place names stay readable over them.
      const firstLabel = m.getStyle().layers.find((l) => l.type === 'symbol')?.id;
      m.addSource('offices', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      m.addSource('near', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      m.addLayer({ id: 'near-ring', type: 'line', source: 'near', filter: ['==', ['get', 'kind'], 'ring'], paint: { 'line-color': colours.ink, 'line-width': 1.5, 'line-dasharray': [3, 3] } }, firstLabel);
      m.addLayer({
        id: 'offices', type: 'circle', source: 'offices',
        paint: {
          'circle-color': colours.dot,
          // A marker grows with the offices it holds: a single office is small, a busy area centre larger.
          'circle-radius': ['min', 20, ['+', ['match', ['get', 'p'], 'street', 4.5, 5.5], ['*', 2.1, ['sqrt', ['-', ['get', 'n'], 1]]]]],
          'circle-opacity': ['match', ['get', 'p'], 'street', 0.92, 0.62],
          'circle-stroke-color': colours.halo,
          'circle-stroke-width': 1.5,
        },
      }, firstLabel);
      m.addLayer({
        id: 'office-counts', type: 'symbol', source: 'offices', filter: ['>=', ['get', 'n'], 3],
        // Counts that would collide give way, the largest first, so a crowded view stays readable.
        layout: { 'text-field': ['to-string', ['get', 'n']], 'text-font': ['Noto Sans Bold'], 'text-size': 11, 'symbol-sort-key': ['-', 0, ['get', 'n']], 'text-padding': 1 },
        paint: { 'text-color': colours.label },
      });
      m.addLayer({ id: 'near-point', type: 'circle', source: 'near', filter: ['==', ['get', 'kind'], 'point'], paint: { 'circle-color': colours.ink, 'circle-radius': 5, 'circle-stroke-color': colours.halo, 'circle-stroke-width': 2 } });
      m.on('mouseenter', 'offices', () => { m.getCanvas().style.cursor = 'pointer'; });
      m.on('mouseleave', 'offices', () => { m.getCanvas().style.cursor = ''; });
      m.on('click', 'offices', (e) => {
        const f = e.features?.[0];
        if (!f) return;
        const { records: rows, lookups: names, list, onArea: toArea } = current.current;
        const s = list[Number(f.properties.s)];
        if (!s) return;
        const popupRef: { current: Popup | null } = { current: null };
        const content = popup(s, rows, names, (id) => { popupRef.current?.remove(); toArea(id); });
        popupRef.current = new Popup({ offset: 10, maxWidth: '300px' }).setLngLat([s.lon, s.lat]).setDOMContent(content).addTo(m);
      });
      setReady(true);
    });
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
      setReady(false);
    };
  }, [theme]);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const list = stacks(records);
    current.current.list = list;
    (m.getSource('offices') as GeoJSONSource).setData(stackFeatures(list));
    (m.getSource('near') as GeoJSONSource).setData(nearFeatures(near, radiusKm));
    const bounds = new LngLatBounds();
    if (near) for (const p of ring(near.lat, near.lon, radiusKm, 24)) bounds.extend(p);
    else {
      // Frame the chosen areas, else the chosen cities, else everything drawn.
      const cities = new Set(hubs.flatMap((h) => lookups.hubCities.get(h) ?? []));
      const inAreas = areas.length ? list.filter((s) => areas.includes(s.area ?? '')) : [];
      const inCities = cities.size ? list.filter((s) => cities.has(s.city)) : [];
      const focus = inAreas.length ? inAreas : inCities.length ? inCities : list;
      for (const s of focus) bounds.extend([s.lon, s.lat]);
    }
    if (!bounds.isEmpty()) m.fitBounds(bounds, { padding: 36, maxZoom: 14, duration: 0 });
  }, [records, lookups, near, radiusKm, areas, hubs, ready]);

  if (failed) return <div className="results-map results-map--loading">The map needs WebGL, which this browser has turned off. The list below has every company.</div>;
  return <div ref={box} className="results-map" role="region" aria-label="Map of listed companies" />;
}

// Built from DOM nodes, not an HTML string, so company text is never interpreted as markup.
function popup(s: Stack, rows: CoreRecord[], lookups: Lookups, onArea: (id: string) => void): HTMLElement {
  const el = (tag: string, className?: string, text?: string) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const div = el('div', 'map-popup');
  const place = `${s.area ? `${lookups.area.get(s.area)?.label ?? s.area}, ` : ''}${lookups.city.get(s.city)?.label ?? s.city}`;
  const head = el('div', 'map-popup__head');
  head.append(el('strong', undefined, s.offices.length === 1 ? rows[s.offices[0][0]]?.name ?? '' : `${s.offices.length} companies`));
  head.append(el('span', 'map-popup__place', `${place} · ${s.precision === 'street' ? 'street level' : 'area centre'}`));
  div.append(head);

  const list = el('ul', 'map-popup__list');
  for (const [ri] of s.offices.slice(0, POPUP_ROWS)) {
    const r = rows[ri];
    if (!r) continue;
    const li = el('li');
    const a = el('a', undefined, r.name) as HTMLAnchorElement;
    a.href = companyUrl(r.handle, 'profile');
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    li.append(a);
    const meta = [lookups.industry.get(r.industry) ?? '', r.followers !== null ? formatFollowers(r.followers) : ''].filter(Boolean).join(' · ');
    if (meta) li.append(el('span', undefined, meta));
    list.append(li);
  }
  div.append(list);
  const more = s.offices.length - POPUP_ROWS;
  if (s.area) {
    const foot = el('div', 'map-popup__foot');
    const button = el('button', undefined, more > 0 ? `List all ${s.offices.length} in this area` : 'List this area only') as HTMLButtonElement;
    button.type = 'button';
    const area = s.area;
    button.addEventListener('click', () => onArea(area));
    if (more > 0) foot.append(el('span', undefined, `and ${more} more`));
    foot.append(button);
    div.append(foot);
  } else if (more > 0) {
    div.append(el('div', 'map-popup__foot', `and ${more} more`));
  }
  return div;
}
