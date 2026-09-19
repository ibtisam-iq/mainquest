// Short codes shown in location chips. Most are the abbreviations in common local use; a city without
// one here, such as a city learned from the data, gets its initials or its first three letters.
export const CITY_CODES: Record<string, string> = {
  islamabad: 'ISB', rawalpindi: 'RWP', lahore: 'LHR', karachi: 'KHI', faisalabad: 'FSD',
  peshawar: 'PEW', multan: 'MUL', sialkot: 'SKT', quetta: 'QTA', gujranwala: 'GRW',
  hyderabad: 'HYD', abbottabad: 'ABT', bahawalpur: 'BWP', gilgit: 'GIL', gujrat: 'GRT',
  haripur: 'HRP', jhelum: 'JLM', mardan: 'MRD', mirpur: 'MPR', muzaffarabad: 'MZD',
  sargodha: 'SGD', skardu: 'KDU', sukkur: 'SKZ', taxila: 'TXL', wah: 'WAH',
};

export function cityCode(id: string): string {
  if (CITY_CODES[id]) return CITY_CODES[id];
  const words = id.split('-').filter(Boolean);
  return (words.length > 1 ? words.map((w) => w[0]).join('').slice(0, 3) : id.slice(0, 3)).toUpperCase();
}
