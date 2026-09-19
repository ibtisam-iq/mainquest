// Display formats shared by the browse view and the landing pages.

// Follower counts arrive already rounded ("24K followers"), so they are shown the same way.
const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

export function formatFollowers(n: number): string {
  return `${compact.format(n)} ${n === 1 ? 'follower' : 'followers'}`;
}

// Associated members are an exact count, so they are shown in full ("1,129 associated members").
export function formatMembers(n: number): string {
  return `${n.toLocaleString('en')} associated ${n === 1 ? 'member' : 'members'}`;
}

// "2026-09-05" becomes "5 Sep 2026". Built by hand rather than with toLocaleDateString, whose month
// abbreviations differ between browsers ("Sep" or "Sept"), and read as a calendar date so no time zone shifts it.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}
