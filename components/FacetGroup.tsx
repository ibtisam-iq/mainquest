'use client';

import { useId, useState, type ReactNode } from 'react';
import { Icon } from './Icon.tsx';

export interface FacetOption {
  id: string;
  label: string;
  count: number;
  hint?: string;
}

interface Props {
  title: string;
  options: FacetOption[];
  selected: string[];
  onToggle: (id: string) => void;
  onClear?: () => void;
  searchable?: boolean;
  initial?: number;
  // A line under the title, such as how many companies the numbers cover.
  note?: string;
  // A control shown above the options, such as the specialties' "any" or "all".
  extra?: ReactNode;
  // A short list with an order of its own (ranges, kinds of company): ticking an option leaves it in place
  // rather than moving it to the top.
  keepOrder?: boolean;
}

// Lowercase, accents removed, and every run of other characters one space: "f7", "F-7" and "f 7" agree,
// as do "Gulshan-e-Iqbal" and "gulshan e iqbal".
const loose = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const squeeze = (s: string) => s.replace(/ /g, '');

// A list of checkboxes with live counts. Long lists show the most common values first and can be searched.
export function FacetGroup({ title, options, selected, onToggle, onClear, searchable = false, initial = 8, note, extra, keepOrder = false }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [filter, setFilter] = useState('');
  const id = useId();
  const needle = loose(filter);
  const matching = needle ? options.filter((o) => loose(o.label).includes(needle) || squeeze(loose(o.label)).includes(squeeze(needle))) : options;
  const chosen = matching.filter((o) => selected.includes(o.id));
  const rest = matching.filter((o) => !selected.includes(o.id) && o.count > 0);
  const shown = keepOrder
    ? matching.filter((o) => selected.includes(o.id) || o.count > 0)
    : expanded || needle ? [...chosen, ...rest] : [...chosen, ...rest.slice(0, Math.max(0, initial - chosen.length))];
  const hidden = chosen.length + rest.length - shown.length;

  return (
    <section className="facet" aria-labelledby={id}>
      <h3 className="facet__title" id={id}>
        {title}
        {selected.length > 0 && onClear && <button type="button" onClick={onClear}>Clear</button>}
      </h3>
      {note && <p className="facet__note">{note}</p>}
      {extra}
      {searchable && options.length > initial && (
        <div className="field">
          <Icon name="search" size={15} />
          <input className="facet__search" type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={`Find ${title.toLowerCase()}`} aria-label={`Find ${title.toLowerCase()}`} />
        </div>
      )}
      {shown.map((o) => (
        <label key={o.id} className="option" data-empty={o.count === 0}>
          <input type="checkbox" checked={selected.includes(o.id)} onChange={() => onToggle(o.id)} />
          <span className="option__label">{o.label}{o.hint && <span className="option__hint">{o.hint}</span>}</span>
          <span className="option__count">{o.count.toLocaleString('en')}</span>
        </label>
      ))}
      {shown.length === 0 && <p className="facet__none">No matches.</p>}
      {hidden > 0 && !needle && (
        <button type="button" className="text-button facet__more" onClick={() => setExpanded(true)}>Show {hidden} more <Icon name="chevronDown" size={14} /></button>
      )}
      {expanded && !needle && rest.length > initial && (
        <button type="button" className="text-button facet__more" onClick={() => setExpanded(false)}>Show fewer</button>
      )}
    </section>
  );
}
