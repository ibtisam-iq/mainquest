// The handle is the last path segment of a profile URL and the primary key of every record.

export type HandleOutcome =
  | { ok: true; handle: string; subpage: boolean }
  | { ok: false; reason: 'empty' | 'no_company_segment' | 'malformed' };

export function extractHandle(rawUrl: string): HandleOutcome {
  const text = rawUrl.trim();
  if (!text) return { ok: false, reason: 'empty' };
  const match = /\/company\/([^/?#]+)(\/[^?#]*)?/i.exec(text);
  if (!match) return { ok: false, reason: 'no_company_segment' };
  // Checked before decoding: a handle may legitimately contain an encoded character such as %C2%A0.
  const raw = match[1];
  if (/\s/.test(raw) || raw.length > 200) return { ok: false, reason: 'malformed' };
  let segment = raw;
  try {
    segment = decodeURIComponent(raw);
  } catch {
    // A stray percent sign; keep the raw segment.
  }
  const decoded = segment.normalize('NFC').toLowerCase();
  if (!decoded.trim()) return { ok: false, reason: 'malformed' };
  // Stored in its URL-encoded form: always ASCII, and exactly what appears in a link.
  const handle = encodeURIComponent(decoded);
  const rest = (match[2] ?? '').replace(/^\/+|\/+$/g, '');
  return { ok: true, handle, subpage: rest.length > 0 };
}
