'use client';

import { useEffect, useState, type RefObject } from 'react';
import { Icon } from './Icon.tsx';

interface Props {
  // The results bar; once it has scrolled out of view above, the floating controls appear.
  anchor: RefObject<HTMLElement | null>;
  active: number;
  view: 'list' | 'map';
  onFilters: () => void;
  onView: (view: 'list' | 'map') => void;
}

// Controls that stay within reach further down the list. On a phone: filters, list or map, and back to
// the top; on a wider screen, only back to the top.
export function FloatingBar({ anchor, active, view, onFilters, onView }: Props) {
  const [pastBar, setPastBar] = useState(false);
  const [atFooter, setAtFooter] = useState(false);
  useEffect(() => {
    const el = anchor.current;
    const footer = document.querySelector('.site-footer');
    if (!el) return;
    const bar = new IntersectionObserver(([entry]) => setPastBar(!entry.isIntersecting && entry.boundingClientRect.top < 0));
    // The controls step aside once the footer comes into view, so they never sit over its links.
    const end = new IntersectionObserver(([entry]) => setAtFooter(entry.isIntersecting));
    bar.observe(el);
    if (footer) end.observe(footer);
    return () => {
      bar.disconnect();
      end.disconnect();
    };
  }, [anchor]);
  const shown = pastBar && !atFooter;
  const toTop = () => anchor.current?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  return (
    <div className="floatbar" data-shown={shown} aria-hidden={!shown}>
      <button type="button" className="floatbar__item floatbar__filters" onClick={onFilters} tabIndex={shown ? 0 : -1}>
        <Icon name="sliders" size={16} />Filters{active > 0 && <span className="badge">{active}</span>}
      </button>
      <button type="button" className="floatbar__item floatbar__view" onClick={() => onView(view === 'map' ? 'list' : 'map')} tabIndex={shown ? 0 : -1}>
        <Icon name={view === 'map' ? 'list' : 'map'} size={16} />{view === 'map' ? 'List' : 'Map'}
      </button>
      <button type="button" className="floatbar__item floatbar__top" onClick={toTop} aria-label="Back to the top of the results" tabIndex={shown ? 0 : -1}>
        <Icon name="arrowUp" size={17} />
      </button>
    </div>
  );
}
