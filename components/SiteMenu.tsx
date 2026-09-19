'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from './Icon.tsx';

interface MenuLink { href: string; label: string; count: number }

// On a phone the header's links fold into this menu: the city pages, the largest industries and the code.
export function SiteMenu({ cities, industries }: { cities: MenuLink[]; industries: MenuLink[] }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const box = useRef<HTMLDivElement | null>(null);
  useEffect(() => setOpen(false), [path]);
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
  const item = (l: MenuLink) => (
    <li key={l.href}>
      <Link href={l.href} aria-current={path === l.href ? 'page' : undefined}><span>{l.label}</span><span className="site-menu__n">{l.count.toLocaleString('en')}</span></Link>
    </li>
  );
  return (
    <div className="site-menu" ref={box}>
      <button type="button" className="icon-link site-menu__button" aria-expanded={open} aria-controls="site-menu-panel" aria-label={open ? 'Close menu' : 'Menu'} onClick={() => setOpen(!open)}>
        <Icon name={open ? 'close' : 'menu'} size={18} />
      </button>
      {open && (
        <div className="site-menu__panel" id="site-menu-panel">
          <p className="site-menu__label">Cities</p>
          <ul>{cities.map(item)}</ul>
          <p className="site-menu__label">Industries</p>
          <ul>{industries.map(item)}</ul>
          <Link className="site-menu__all" href="/companies">Every city, area and industry<Icon name="arrowRight" size={15} /></Link>
          <a className="site-menu__code" href="https://github.com/ibtisam-iq/mainquest" rel="noopener noreferrer"><Icon name="github" size={16} />Code on GitHub</a>
        </div>
      )}
    </div>
  );
}
