// Markdown keeps a character reference (`&amp;`, `&#39;`) as it was written in the text of a token, and leaves it to the HTML that is made
// from it. A renderer that makes elements (which escape their own text) needs the character the reference stands for.
const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: '\u00a0',
  copy: '\u00a9',
  reg: '\u00ae',
  trade: '\u2122',
  hellip: '\u2026',
  mdash: '\u2014',
  ndash: '\u2013',
  lsquo: '\u2018',
  rsquo: '\u2019',
  ldquo: '\u201c',
  rdquo: '\u201d',
  laquo: '\u00ab',
  raquo: '\u00bb',
  larr: '\u2190',
  rarr: '\u2192',
  uarr: '\u2191',
  darr: '\u2193',
  harr: '\u2194',
  times: '\u00d7',
  divide: '\u00f7',
  middot: '\u00b7',
  bull: '\u2022',
  deg: '\u00b0',
  plusmn: '\u00b1',
  micro: '\u00b5',
  para: '\u00b6',
  sect: '\u00a7',
  euro: '\u20ac',
  pound: '\u00a3',
  yen: '\u00a5',
  cent: '\u00a2',
  ne: '\u2260',
  le: '\u2264',
  ge: '\u2265',
  infin: '\u221e',
  check: '\u2713',
};

/** The text with the character references the Markdown parser leaves in it made into the characters: the numeric ones, and the named ones above. Any other `&...;` is left as it is. */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name.startsWith('#')) {
      const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return NAMED[name.toLowerCase()] ?? whole;
  });
}
