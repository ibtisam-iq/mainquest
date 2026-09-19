import type { Constellation } from '../lib/constellation.ts';

// Draws a constellation: office dots, crosshairs on city centres, and any names beside them.
export function DotMap({ map, className, title }: { map: Constellation; className?: string; title?: string }) {
  return (
    <svg className={className} viewBox={`0 0 ${map.width} ${map.height}`} role={title ? 'img' : undefined} aria-label={title} aria-hidden={title ? undefined : true} focusable="false">
      {map.dots.map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} />)}
      {map.marks.map(([x, y], i) => <path key={`m${i}`} className="mark" d={`M${x - 5} ${y}h10M${x} ${y - 5}v10`} />)}
      {map.labels.map(([x, y, text, anchor]) => <text key={text} className="dot-label" x={x} y={y} textAnchor={anchor}>{text}</text>)}
    </svg>
  );
}
