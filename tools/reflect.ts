// Generates src/pipis/reflect.ts: what the server's DOM needs to know about HTML to write the markup a browser would have made, taken
// from jsdom (which implements the HTML standard's reflection) so that it is not written from memory.
//   node tools/reflect.ts            prints it
//   node tools/reflect.ts --write    writes src/pipis/reflect.ts
// tools/server.test.ts checks that the file is what this prints.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Void elements, and the tags that hold their text as it is. The HTML standard's own lists: jsdom does not expose them. */
const VOID = [
  'area',
  'base',
  'basefont',
  'bgsound',
  'br',
  'col',
  'embed',
  'frame',
  'hr',
  'img',
  'input',
  'keygen',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
];
const RAW_TEXT = ['iframe', 'noembed', 'noframes', 'plaintext', 'script', 'style', 'xmp'];

/** Properties that are state, not reflection: the server writes them as the attributes a form is made with, or as content. */
const NOT_REFLECTED = new Set([
  'style',
  'innerHTML',
  'outerHTML',
  'textContent',
  'innerText',
  'outerText',
  'value',
  'checked',
  'selected',
  'defaultValue',
  'defaultChecked',
  'defaultSelected',
  'text',
  'nodeValue',
]);

type Kind = 'string' | 'number' | 'boolean';

/** Every tag name HTML has had (the standard's list, with the obsolete ones). jsdom says which of them it knows: that is what is used. */
const CANDIDATES =
  'a abbr acronym address applet area article aside audio b base basefont bdi bdo bgsound big blink blockquote body br button canvas caption center cite code col colgroup content data datalist dd del details dfn dialog dir div dl dt em embed fieldset figcaption figure font footer form frame frameset h1 h2 h3 h4 h5 h6 head header hgroup hr html i iframe image img input ins isindex kbd keygen label legend li link listing main map mark marquee menu menuitem meta meter multicol nav nextid nobr noembed noframes noscript object ol optgroup option output p param picture plaintext pre progress q rb rp rt rtc ruby s samp script search section select selectedcontent slot small source spacer span strike strong style sub summary sup table tbody td template textarea tfoot th thead time title tr track tt u ul var video wbr xmp'.split(
    ' ',
  );

const q = (s: string) => `'${s}'`;
const list = (a: string[]) => `[${a.map(q).join(', ')}]`;

export function generate(): string {
  const { window } = new JSDOM('<!doctype html><body></body>');
  const { document } = window;
  const html = CANDIDATES.filter((t) => !(document.createElement(t) instanceof window.HTMLUnknownElement));

  // What each property reflects as, and on which tags: a property is the element's own, so `start` is an attribute on an `ol` and nothing on a `ul`.
  const props = new Map<string, { attribute: string; kind: Kind; tags: string[] }>();
  const conflicts: string[] = [];
  for (const tag of html) {
    const probe = document.createElement(tag);
    const names = new Set<string>();
    for (
      let proto: object | null = Object.getPrototypeOf(probe);
      proto && proto !== Object.prototype;
      proto = Object.getPrototypeOf(proto)
    ) {
      for (const name of Object.getOwnPropertyNames(proto)) {
        const d = Object.getOwnPropertyDescriptor(proto, name);
        if (d?.set && !name.startsWith('on') && !NOT_REFLECTED.has(name)) names.add(name);
      }
    }
    for (const name of names) {
      const attempt = (value: unknown): [string, string] | undefined => {
        const el = document.createElement(tag);
        try {
          Reflect.set(el, name, value);
        } catch {
          return undefined;
        }
        const attr = el.attributes[0];
        return el.attributes.length === 1 && attr ? [attr.name, attr.value] : undefined;
      };
      let found: [string, Kind] | undefined;
      const asBoolean = attempt(true);
      const asString = attempt('probe');
      const asNumber = attempt(7);
      if (asBoolean && asBoolean[1] === '' && attempt(false) === undefined) found = [asBoolean[0], 'boolean'];
      // Text, or one of a few words (`type` of a button): whatever it is given, a valid value is written as it is.
      else if (asString) found = [asString[0], 'string'];
      else if (asNumber && asNumber[1] === '7') found = [asNumber[0], 'number'];
      if (!found) continue;
      const before = props.get(name);
      if (!before) {
        props.set(name, { attribute: found[0], kind: found[1], tags: [tag] });
        continue;
      }
      // A number on one tag and text on another (`width`) is written the same way: as text.
      const sameWay = before.attribute === found[0] && (before.kind === found[1] || (before.kind !== 'boolean' && found[1] !== 'boolean'));
      if (!sameWay) conflicts.push(`${name}: ${before.attribute}/${before.kind} and ${found.join('/')} on <${tag}>`);
      else {
        if (before.kind !== found[1]) before.kind = 'string';
        before.tags.push(tag);
      }
    }
  }
  if (conflicts.length) throw new Error(`a property reflects differently on different tags:\n${conflicts.join('\n')}`);

  // What the standard has and jsdom does not implement (yet): the properties of elements that are newer than it. The table is only as good as its source, so
  // these are written down by hand, from the standard, and a property jsdom does have is never overridden.
  const NEWER: [name: string, attribute: string, kind: Kind, tags?: string[]][] = [
    ['inert', 'inert', 'boolean'],
    ['popover', 'popover', 'string'],
    ['enterKeyHint', 'enterkeyhint', 'string'],
    ['autocapitalize', 'autocapitalize', 'string'],
    ['spellcheck', 'spellcheck', 'string'],
    ['contentEditable', 'contenteditable', 'string'],
    ['writingSuggestions', 'writingsuggestions', 'string'],
    ['loading', 'loading', 'string', ['img', 'iframe']],
    ['fetchPriority', 'fetchpriority', 'string', ['img', 'link', 'script']],
    ['decoding', 'decoding', 'string', ['img']],
    ['referrerPolicy', 'referrerpolicy', 'string', ['a', 'area', 'iframe', 'img', 'link', 'script']],
    ['popoverTargetAction', 'popovertargetaction', 'string', ['button', 'input']],
    ['as', 'as', 'string', ['link']],
  ];
  for (const [name, attribute, kind, tags] of NEWER) {
    if (!props.has(name)) props.set(name, { attribute, kind, tags: tags ?? html });
  }

  const sorted = [...props].sort(([a], [b]) => a.localeCompare(b));
  const lines = [
    '// GENERATED by `node tools/reflect.ts --write` from jsdom: do not edit by hand. What the server platform needs to know about HTML.',
    '',
    '/** The tags HTML knows. Any other tag is made as SVG, as the browser build does, by asking whether HTML knows it. */',
    `export const HTML_TAGS: string[] = ${list(html)};`,
    '',
    '/** Tags with no end tag. */',
    `export const VOID_TAGS: string[] = ${list(VOID)};`,
    '',
    '/** Tags whose text is written as it is, not escaped. */',
    `export const RAW_TEXT_TAGS: string[] = ${list(RAW_TEXT)};`,
    '',
    '/** The attribute a property is written as, how its value is made into one (a boolean is there or is not, the rest are text), and the tags that have the property (all, if none are named). */',
    "export const REFLECTED: Record<string, [attribute: string, kind: 'string' | 'number' | 'boolean', tags?: string[]]> = {",
    ...sorted.map(([name, { attribute, kind, tags }]) => {
      // On every tag, or on the tags that have it.
      const where = tags.length === html.length ? '' : `, ${list(tags)}`;
      return `  ${/^[A-Za-z_$][\w$]*$/.test(name) ? name : q(name)}: [${q(attribute)}, '${kind}'${where}],`;
    }),
    '};',
    '',
  ];
  return lines.join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const text = generate();
  if (process.argv.includes('--write')) writeFileSync(join(root, 'src/pipis/reflect.ts'), text);
  else process.stdout.write(text);
}
