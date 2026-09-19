// How search reads text. Shared by the search index and by the marks on matching words, so both agree.

// Words written with symbols that plain splitting would lose. "C#" would become the letter "c", ".NET"
// would become "net" and match "network", and "F-7" would become two loose pieces that match any
// address with an F and a 7 in it. Each is rewritten as one plain word before the text is split.
const SYMBOLS: [RegExp, string][] = [
  [/(^|[^\p{L}\p{N}])c\s?#/giu, '$1csharp'],
  [/(^|[^\p{L}\p{N}])f\s?#/giu, '$1fsharp'],
  [/(^|[^\p{L}\p{N}])c\+\+/giu, '$1cplusplus'],
  [/(^|[\s,;|/(&]|\basp|\bvb|\bado)\.net\b/giu, '$1 dotnet'],
  // Islamabad's sectors and blocks like them: "F-7", "F 7", "F7" and "I-10/2" become "f7" and "i10".
  [/\b([a-i])[-\s]?(\d{1,2})(?!\d)/giu, '$1$2'],
];

// A JavaScript library written "Node.js" is also written "NodeJS" and "Node". In the index it becomes
// both "nodejs" and "node"; in a search it becomes "nodejs", which then finds all three spellings.
const LIBRARIES = 'node|react|vue|next|nuxt|express|angular|three|ember|d3';
const JS_LIBRARY = new RegExp(String.raw`\b(${LIBRARIES})\.js\b`, 'giu');
const JS_LIBRARY_WORD = new RegExp(String.raw`^(${LIBRARIES})\.js` + '$');

export function rewriteForSearch(text: string, forIndex: boolean): string {
  let out = text;
  for (const [pattern, replacement] of SYMBOLS) out = out.replace(pattern, replacement);
  return out.replace(JS_LIBRARY, forIndex ? '$1js $1' : '$1js');
}

// Spaces and punctuation separate words, as in the search library's own default.
const SEPARATOR = /[\n\r\p{Z}\p{P}]+/u;

export function searchWords(text: string, forIndex: boolean): string[] {
  return rewriteForSearch(text, forIndex).split(SEPARATOR).filter(Boolean);
}

// Compatibility form, accents removed, lowercase: styled Unicode letters match plain typing.
export function foldWord(word: string): string {
  return word.normalize('NFKC').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

// A typed piece that is one of the symbol words above, kept whole so its mark covers it as written.
export function symbolTerm(piece: string): string[] | null {
  const p = piece.toLowerCase();
  if (/^(c|f)\s?#$|^c\+\+$|^(asp|vb|ado)?\.net$/.test(p)) return [p];
  const sector = /^([a-i])[-\s]?(\d{1,2})$/.exec(p);
  if (sector) return [`${sector[1]}-${sector[2]}`, `${sector[1]}${sector[2]}`, `${sector[1]} ${sector[2]}`];
  if (JS_LIBRARY_WORD.test(p)) return [p];
  return null;
}
