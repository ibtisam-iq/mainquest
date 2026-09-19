'use client';

import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { RADII_KM, type Near, type Query } from '../lib/query.ts';
import { cityCode } from '../lib/city-codes.ts';
import type { Facets } from './types.ts';
import { Icon } from './Icon.tsx';

interface Props {
  query: Query;
  facets: Facets;
  update: (patch: Partial<Query>) => void;
}

// Choose a point: the device's location (which never leaves the browser) or a known area or city.
export function NearControl({ query, facets, update }: Props) {
  const [text, setText] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  const places = useMemo(
    () => [
      ...facets.areas.map((a) => ({ ref: a.id, label: a.label, hint: cityCode(a.city), count: a.count })),
      ...facets.cities.map((c) => ({ ref: `city:${c.id}`, label: `${c.label} (city centre)`, hint: cityCode(c.id), count: c.count })),
    ],
    [facets],
  );
  const needle = text.trim().toLowerCase();
  const suggestions = needle ? places.filter((p) => p.label.toLowerCase().includes(needle) || p.hint.toLowerCase() === needle).sort((a, b) => b.count - a.count).slice(0, 8) : [];

  const list = useRef<HTMLUListElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const pick = (s: (typeof suggestions)[number]) => {
    const f = s.ref.startsWith('city:') ? facets.cities.find((c) => `city:${c.id}` === s.ref) : facets.areas.find((a) => a.id === s.ref);
    if (f) choose({ lat: f.lat, lon: f.lon, label: `${s.label}${s.ref.startsWith('city:') ? '' : `, ${s.hint}`}`, ref: s.ref });
  };
  // Arrow keys move between the suggestions, Enter in the box takes the first, Escape empties the box.
  const buttons = () => [...(list.current?.querySelectorAll('button') ?? [])];
  const onInputKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && suggestions.length) { e.preventDefault(); buttons()[0]?.focus(); }
    else if (e.key === 'Enter' && suggestions.length) { e.preventDefault(); pick(suggestions[0]); }
    else if (e.key === 'Escape' && text) { e.preventDefault(); setText(''); }
  };
  const onListKey = (e: KeyboardEvent<HTMLUListElement>) => {
    const all = buttons();
    const at = all.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); all[Math.min(all.length - 1, at + 1)]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (at <= 0) inputRef.current?.focus(); else all[at - 1]?.focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); setText(''); inputRef.current?.focus(); }
  };

  const choose = (near: Near) => {
    update({ near, sort: null });
    setText('');
    setStatus(null);
  };

  const locate = () => {
    if (!('geolocation' in navigator)) return setStatus('This browser cannot share a location. Choose an area instead.');
    setStatus('Finding location…');
    navigator.geolocation.getCurrentPosition(
      (pos) => choose({ lat: pos.coords.latitude, lon: pos.coords.longitude, label: 'Current location', ref: 'here' }),
      () => setStatus('Location was not shared. Choose an area instead.'),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  };

  return (
    <section className="facet near" aria-label="Near">
      <h3 className="facet__title">
        Near
        {query.near && <button type="button" onClick={() => update({ near: null, sort: null })}>Clear</button>}
      </h3>
      {query.near ? (
        <>
          <p className="near__point"><Icon name={query.near.ref === 'here' ? 'locate' : 'pin'} size={16} /><strong>{query.near.label}</strong></p>
          <div className="segmented" role="group" aria-label="Distance">
            {RADII_KM.map((km) => (
              <button key={km} type="button" aria-pressed={query.radius === km} onClick={() => update({ radius: km })}>{km} km</button>
            ))}
          </div>
        </>
      ) : (
        <>
          <button type="button" className="btn" onClick={locate}><Icon name="locate" size={16} />Use my location</button>
          <div className="near__search">
            <div className="field">
              <Icon name="pin" size={15} />
              <input ref={inputRef} className="facet__search" type="search" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onInputKey}
                placeholder="Or an area, such as F-7" aria-label="Near an area" aria-autocomplete="list" aria-controls="near-suggestions" aria-expanded={suggestions.length > 0} />
            </div>
            {suggestions.length > 0 && (
              <ul className="near__list" id="near-suggestions" ref={list} onKeyDown={onListKey}>
                {suggestions.map((s) => (
                  <li key={s.ref}>
                    <button type="button" onClick={() => pick(s)}>
                      <span>{s.label}</span> <span className="option__hint">{s.hint}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {text.trim() && suggestions.length === 0 && <p className="near__status">No area or city by that name.</p>}
          {status && <p className="near__status" role="status">{status}</p>}
        </>
      )}
    </section>
  );
}
