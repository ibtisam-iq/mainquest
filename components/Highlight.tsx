import { highlightParts } from '../lib/highlight.ts';

// Text with the searched words marked. Wrapped in one span, so a space beside a mark survives inside a
// flex container such as a chip.
export function Highlight({ text, terms }: { text: string; terms: readonly string[] }) {
  if (terms.length === 0) return <>{text}</>;
  return <span>{highlightParts(text, terms).map((p, i) => (p.match ? <mark key={i}>{p.text}</mark> : p.text))}</span>;
}
