import type { CSSProperties } from 'react';
import Link from 'next/link';

// A ranked list for a landing page, each value drawn with a bar in proportion to the largest.
export function FactCard({ title, items }: { title: string; items: { href: string; label: string; count: number }[] }) {
  if (items.length === 0) return null;
  const max = Math.max(...items.map((i) => i.count));
  return (
    <section className="fact-card">
      <h2>{title}</h2>
      <ul className="bars">
        {items.map((i) => (
          <li key={i.href}>
            <Link href={i.href} style={{ '--w': `${Math.max(4, (i.count / max) * 100)}%` } as CSSProperties}>
              <span className="bars__label">{i.label}</span>
              <span className="bars__n">{i.count.toLocaleString('en')}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
