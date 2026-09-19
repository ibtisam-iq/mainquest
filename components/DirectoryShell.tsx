import type { Ref } from 'react';
import { CityTilesView, type CityTileData } from './CityTiles.tsx';
import { Icon } from './Icon.tsx';

// Placeholders in the shape of the list, shown until the company files arrive.
export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="list" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div className="sk-row" key={i}>
          <span className="sk sk-avatar" />
          <div>
            <span className="sk sk-line sk-line--title" />
            <span className="sk sk-line" style={{ width: `${62 - (i % 3) * 9}%` }} />
            <span className="sk sk-line" style={{ width: '34%', marginBottom: 0 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function FiltersSkeleton() {
  return (
    <div aria-hidden="true">
      {[70, 90, 60, 80, 50, 85, 65].map((w, i) => <span key={i} className="sk sk-facet" style={{ width: `${w}%` }} />)}
    </div>
  );
}

export function SearchBox({ total, value, onChange, onClear, onEscape, inputRef }: { total: number; value?: string; onChange?: (v: string) => void; onClear?: () => void; onEscape?: () => void; inputRef?: Ref<HTMLInputElement> }) {
  return (
    <div className="search" role="search">
      <Icon name="search" size={20} className="search__icon" />
      <label htmlFor="q" className="sr-only">Search {total.toLocaleString('en')} companies</label>
      {/* Form-filling browser extensions stamp their own attributes on search boxes before the page
          loads; that difference from the server's markup is expected, so React is told not to report it. */}
      <input id="q" ref={inputRef} type="search" suppressHydrationWarning value={value} onChange={onChange ? (e) => onChange(e.target.value) : undefined} readOnly={!onChange}
        onKeyDown={onEscape ? (e) => { if (e.key === 'Escape' && value) { e.preventDefault(); onEscape(); } } : undefined}
        autoComplete="off" spellCheck={false} enterKeyHint="search" placeholder="Search name, specialty or area" />
      {value ? (
        <button type="button" className="search__clear" onClick={onClear} aria-label="Clear search"><Icon name="close" size={16} /></button>
      ) : (
        <kbd className="search__kbd" aria-hidden="true">/</kbd>
      )}
    </div>
  );
}

// What the server sends before the browser takes over: the search box, the city tiles and placeholders.
export function DirectoryShell({ total, tiles }: { total: number; tiles: CityTileData[] }) {
  return (
    <>
      <div className="hero-tools">
        <div className="container">
          <SearchBox total={total} />
          <CityTilesView tiles={tiles} search="" />
        </div>
      </div>
      <div className="container">
        <div className="directory">
          <aside className="filters" aria-hidden="true"><div className="filters__body"><FiltersSkeleton /></div></aside>
          <section className="results" aria-label="Results" aria-busy="true">
            <span className="sk sk-toolbar" />
            <ListSkeleton />
            <p className="sr-only" role="status">Loading {total.toLocaleString('en')} companies</p>
          </section>
        </div>
      </div>
    </>
  );
}
