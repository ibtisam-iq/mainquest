'use client';

import { useEffect, useRef, useState } from 'react';
import type { CoreRecord, ExtraRecord } from '../lib/payload.ts';
import { companyUrl, membersUrl } from '../lib/links.ts';
import { nearestPlacedKm, type Near } from '../lib/query.ts';
import type { Lookups } from './types.ts';
import { Icon } from './Icon.tsx';

interface Props {
  records: CoreRecord[];
  extra: Record<string, ExtraRecord> | null;
  lookups: Lookups;
  near: Near | null;
}

function rowsFor({ records, extra, lookups, near }: Props) {
  return records.map((r) => {
    const d = near ? nearestPlacedKm(r, near) : null;
    return {
      name: r.name,
      industry: lookups.industry.get(r.industry) ?? r.industry,
      cities: [...new Set(r.offices.map((o) => lookups.city.get(o.city)?.label ?? o.city))].join('; '),
      areas: [...new Set(r.offices.flatMap((o) => (o.area ? [lookups.area.get(o.area)?.label ?? o.area] : [])))].join('; '),
      run_from: lookups.origins.values.find((v) => v.id === r.origin)?.label ?? r.origin,
      headquarters: (r.hqCountry && lookups.country.get(r.hqCountry)) || '',
      founded: r.founded ?? '',
      followers: r.followers ?? '',
      followers_counted: extra?.[r.handle]?.followersAsOf ?? '',
      associated_members: r.members ?? '',
      members_recorded: extra?.[r.handle]?.membersAsOf ?? '',
      last_updated: extra?.[r.handle]?.updated ?? '',
      website: r.website ?? '',
      profile: companyUrl(r.handle, 'profile'),
      jobs: companyUrl(r.handle, 'jobs'),
      associated_members_page: membersUrl(r.handle, extra?.[r.handle]?.companyId ?? null),
      specialties: extra?.[r.handle]?.specialties ?? '',
      addresses: (extra?.[r.handle]?.addresses ?? []).filter(Boolean).join(' | '),
      ...(near ? { distance_km: d ? d.km.toFixed(1) : '', location_precision: d ? r.offices[d.office].precision : 'city' } : {}),
    };
  });
}

const cell = (v: unknown) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function download(name: string, type: string, body: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Downloads exactly the rows currently listed, with the generated links and, when set, the distance.
export function ExportButton(props: Props) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement | null>(null);
  // The menu closes on a click elsewhere or on Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const stamp = new Date().toISOString().slice(0, 10);
  const run = (format: 'csv' | 'json') => {
    const rows = rowsFor(props);
    if (format === 'json') download(`mainquest-${stamp}.json`, 'application/json', JSON.stringify(rows, null, 2));
    else {
      const head = Object.keys(rows[0] ?? { name: '' });
      // The byte order mark makes spreadsheet programs read the file as UTF-8.
      download(`mainquest-${stamp}.csv`, 'text/csv;charset=utf-8', '\uFEFF' + [head.join(','), ...rows.map((r) => head.map((h) => cell((r as Record<string, unknown>)[h])).join(','))].join('\r\n'));
    }
    setOpen(false);
  };
  const n = props.records.length.toLocaleString('en');
  return (
    <div className="export" ref={box}>
      <button type="button" className="btn" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(!open)} disabled={props.records.length === 0} aria-label={`Export ${n} companies`}>
        <Icon name="download" size={16} /><span className="btn__word">Export</span><span className="badge badge--quiet">{n}</span>
      </button>
      {open && (
        <div className="export__menu" role="menu">
          <button type="button" role="menuitem" onClick={() => run('csv')}>CSV<span>Opens in spreadsheet programs</span></button>
          <button type="button" role="menuitem" onClick={() => run('json')}>JSON<span>For scripts and other tools</span></button>
          {!props.extra && <p>Specialties and addresses are still loading and will be blank.</p>}
        </div>
      )}
    </div>
  );
}
