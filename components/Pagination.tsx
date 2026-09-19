'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { pageWindow } from '../lib/query.ts';
import { Icon } from './Icon.tsx';

interface Props {
  page: number;
  count: number;
  total: number;
  per: number;
  href: (page: number) => string;
  onNavigate: () => void;
  // The page size choice, shown here on phones, where the bar above has no room for it.
  children?: ReactNode;
}

// Numbered pages below the list. Each page is a real link, so it can be opened in a new tab and the
// back button returns to the previous page. Phones get a narrower run of numbers, so the pager fits on
// one line; CSS shows one run or the other.
export function Pagination({ page, count, total, per, href, onNavigate, children }: Props) {
  const from = (page - 1) * per + 1;
  const to = Math.min(page * per, total);
  const fmt = (n: number) => n.toLocaleString('en');
  const run = (span: number, className: string) => (
    <ol className={`pager__pages ${className}`}>
      <li>
        {page > 1 ? (
          <Link className="pager__step" href={href(page - 1)} scroll={false} onClick={onNavigate} rel="prev" aria-label="Previous page">
            <Icon name="chevronLeft" size={16} /><span className="pager__word">Previous</span>
          </Link>
        ) : (
          <span className="pager__step" aria-disabled="true"><Icon name="chevronLeft" size={16} /><span className="pager__word">Previous</span></span>
        )}
      </li>
      {pageWindow(page, count, span).map((p, i) =>
        p === 'gap' ? (
          <li key={`gap-${i}`} className="pager__gap" aria-hidden="true">…</li>
        ) : (
          <li key={p}>
            <Link className="pager__page" href={href(p)} scroll={false} onClick={onNavigate} aria-current={p === page ? 'page' : undefined} aria-label={`Page ${p}`}>
              {fmt(p)}
            </Link>
          </li>
        ),
      )}
      <li>
        {page < count ? (
          <Link className="pager__step" href={href(page + 1)} scroll={false} onClick={onNavigate} rel="next" aria-label="Next page">
            <span className="pager__word">Next</span><Icon name="chevronRight" size={16} />
          </Link>
        ) : (
          <span className="pager__step" aria-disabled="true"><span className="pager__word">Next</span><Icon name="chevronRight" size={16} /></span>
        )}
      </li>
    </ol>
  );
  return (
    <nav className="pager" aria-label="Pages">
      <div className="pager__info">
        <p className="pager__range">
          <strong>{fmt(from)}</strong> to <strong>{fmt(to)}</strong> of {fmt(total)}
        </p>
        {children && <div className="pager__per">{children}</div>}
      </div>
      {count > 1 && (
        <>
          {run(2, 'pager__pages--wide')}
          {run(1, 'pager__pages--narrow')}
        </>
      )}
    </nav>
  );
}
