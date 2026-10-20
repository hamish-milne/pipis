import { describe, expect, it } from 'vite-plus/test';
import { parseNav } from './nav.ts';
import { join } from 'node:path';
import { pagesOf } from './handler.ts';
import { loadPages, pagesData, sectionOf, type PagesData } from './pages.ts';
import { decodeEntities } from './entities.ts';
import { readFrontmatter } from './frontmatter.ts';
import { pageUrl, parsePage, relativeUrl, type DocCode, type DocHeading, type PageContext } from './markdown.ts';
import type { Tokens } from 'marked';
import { toJs } from './transform.ts';

const context = (file: string): PageContext => ({ file, repoUrl: 'https://example.test/repo/blob/main' });

describe('the pages of a site', () => {
  it('maps a Markdown file to its page, and a README to the index of its folder', () => {
    expect(pageUrl('guide/lifecycle.md')).toBe('guide/lifecycle.html');
    expect(pageUrl('README.md')).toBe('index.html');
    expect(pageUrl('adr/README.md')).toBe('adr/index.html');
  });

  it('links from one page to another by a relative path, so that the site can be put under any path', () => {
    expect(relativeUrl('guide/a.html', 'guide/b.html')).toBe('b.html');
    expect(relativeUrl('guide/a.html', 'start/c.html')).toBe('../start/c.html');
    expect(relativeUrl('index.html', 'guide/b.html')).toBe('guide/b.html');
    expect(relativeUrl('adr/index.html', 'adr/index.html')).toBe('index.html');
  });
});

describe('the navigation', () => {
  it('is the sections and links of the index, in its order', () => {
    const nav = parseNav(
      [
        '# Docs',
        '',
        '## Start',
        '',
        '- [One](start/one.md): the first.',
        '- [Two](two.md)',
        '',
        '## More',
        '- [Three](more/README.md): third',
      ].join('\r\n'),
    );
    expect(nav.map((s) => [s.title, s.items.map((i) => [i.title, i.url, i.about])])).toEqual([
      [
        'Start',
        [
          ['One', 'start/one.html', 'the first.'],
          ['Two', 'two.html', ''],
        ],
      ],
      ['More', [['Three', 'more/index.html', 'third']]],
    ]);
  });

  it('leaves out the files outside the docs, which are not pages, and a section left empty', () => {
    const nav = parseNav('## For contributors\n- [CONTRIBUTING](../CONTRIBUTING.md): how\n## Start\n- [One](one.md)');
    expect(nav.map((s) => s.title)).toEqual(['Start']);
  });
});

describe('reading a page', () => {
  it('gives a heading the anchor GitHub gives it, so a link works on both', () => {
    const { tokens, headings, title } = parsePage(
      '# The page\n\n## The `Axis` class\n\n### Plot x/y\n\n## Again\n\n## Again\n',
      context('a.md'),
    );
    expect(title).toBe('The page');
    expect(headings).toEqual([
      { depth: 2, id: 'the-axis-class', text: 'The Axis class' },
      { depth: 3, id: 'plot-xy', text: 'Plot x/y' },
      { depth: 2, id: 'again', text: 'Again' },
      { depth: 2, id: 'again-1', text: 'Again' },
    ]);
    expect(tokens.filter((t): t is DocHeading => t.type === 'heading').map((t) => t.id)).toEqual([
      'the-page',
      'the-axis-class',
      'plot-xy',
      'again',
      'again-1',
    ]);
  });

  it('points a link to another page at that page, and one to a file outside the docs at its place on the host', () => {
    const { tokens } = parsePage(
      '[a](b.md) [c](../start/d.md#x) [e](README.md) [f](../../LLM.md) [g](https://example.test/x.md) [h](#here)',
      context('guide/a.md'),
    );
    const paragraph = tokens[0] as Tokens.Paragraph;
    expect(paragraph.tokens.filter((t): t is Tokens.Link => t.type === 'link').map((l) => l.href)).toEqual([
      'b.html',
      '../start/d.html#x',
      'index.html',
      'https://example.test/repo/blob/main/LLM.md',
      'https://example.test/x.md',
      '#here',
    ]);
  });

  it('makes a live block an example, and reads what the info string says of the rest', () => {
    const markdown = [
      '```tsx live title="One"',
      'export default () => <p />;',
      '```',
      '',
      '```tsx check title="Two"',
      'let x = 1;',
      '```',
      '',
      '```bash',
      'npm i',
      '```',
    ].join('\n');
    const { tokens, examples } = parsePage(markdown, context('a.md'));
    expect(examples.map((b) => b.id)).toEqual(['one']);
    const code = tokens.filter((t): t is DocCode => t.type === 'code');
    expect(code.map((c) => [c.language, c.block?.id])).toEqual([
      ['tsx', 'one'],
      ['tsx', undefined],
      ['bash', undefined],
    ]);
  });

  it('says what the page is called and what it is about, as text', () => {
    const page = parsePage('# A `page` &amp; more\n\nThis is **the** first <i>paragraph</i> &lt;ok&gt;.\n\nSecond.\n', context('a.md'));
    expect(page.title).toBe('A page & more');
    expect(page.description).toBe('This is the first paragraph <ok>.');
  });

  it('refuses a block that is wrong, naming where', () => {
    expect(() => parsePage('```tsx live\nx\n```\n', context('x.md'))).toThrow(/x\.md:1: a live block needs title/);
  });
});

describe('character references', () => {
  it('are made into the characters they stand for, and any the table does not know are left as they are', () => {
    expect(decodeEntities('a &amp; b &lt;c&gt; &quot;d&quot; &#39;e&#39; &#x41; &copy; &unknownthing; &#0; &#99999999;')).toBe(
      'a & b <c> "d" \'e\' A © &unknownthing; &#0; &#99999999;',
    );
  });
});

describe('front matter', () => {
  it('reads the description, the tags and the section, and leaves the page with the lines it had', () => {
    const text = [
      '---',
      'description: What it is: a page.',
      'tags: [one, two-words, "three"]',
      "section: 'For people'",
      '---',
      '# Title',
      '',
    ].join('\n');
    const { data, body } = readFrontmatter(text, 'a.md');
    expect(data).toEqual({ description: 'What it is: a page.', tags: ['one', 'two-words', 'three'], section: 'For people' });
    expect(body.split('\n').length, 'the lines of the file are the lines of the page').toBe(text.split('\n').length);
    expect(body.trim()).toBe('# Title');
    expect(body.split('\n')[5]).toBe('# Title');
  });

  it('is not there when a page does not begin with it', () => {
    expect(readFrontmatter('# Title\n\n---\nnot: front matter\n---\n', 'a.md')).toEqual({
      data: { tags: [] },
      body: '# Title\n\n---\nnot: front matter\n---\n',
    });
  });

  it('refuses what it does not understand, naming the line', () => {
    const read =
      (...lines: string[]) =>
      () =>
        readFrontmatter(['---', ...lines, '---', ''].join('\n'), 'x.md');
    expect(read('tags: [a]', 'tgs: [b]')).toThrow(/x\.md:3: unknown key 'tgs' in the front matter \(keys: description, tags, section\)/);
    expect(read('tags: a, b')).toThrow(/x\.md:2: tags are a list in brackets/);
    expect(read('tags: [Upper]')).toThrow(/x\.md:2: the tag 'Upper' is not lowercase words joined by hyphens/);
    expect(read('tags: [a, a]')).toThrow(/x\.md:2: a tag is in the list twice/);
    expect(read('description: one', 'description: two')).toThrow(/x\.md:3: 'description' is in the front matter twice/);
    expect(read('description:')).toThrow(/x\.md:2: 'description' has no value/);
    expect(read('just some words')).toThrow(/x\.md:2: cannot read 'just some words'/);
    expect(() => readFrontmatter('---\ntags: [a]\n# Title\n', 'x.md')).toThrow(/x\.md:1: the front matter is never closed/);
  });
});

describe('the section of a page', () => {
  const nav = parseNav('## Guide\n- [One](guide/one.md)\n\n## Reference\n- [Decisions](adr/README.md)\n');

  it('is what its front matter says, else the section it is listed in, else the section of a page in its folder', () => {
    expect(sectionOf('guide/one.md', 'Chosen', nav)).toBe('Chosen');
    expect(sectionOf('guide/one.md', undefined, nav)).toBe('Guide');
    expect(sectionOf('adr/0001-a-decision.md', undefined, nav)).toBe('Reference');
    expect(sectionOf('elsewhere/page.md', undefined, nav)).toBe('Documentation');
    expect(sectionOf('README.md', undefined, nav)).toBe('Documentation');
  });
});

describe('the transform of an example', () => {
  it('takes out the types and compiles JSX to the runtime of the library, leaving ES2022 as it is', () => {
    const js = toJs(
      "import { reactive } from 'pipis';\nexport default function A(props: { n?: number }) { const x = props.n ?? 1; return <p class={x}>{reactive(x)}</p>; }\nclass B { #p = 1; static { } }\n",
      'pipis',
    );
    expect(js).toContain('from "pipis/jsx-runtime"');
    expect(js).not.toContain(': number');
    expect(js).toContain('?? 1');
    expect(js).toContain('#p');
    expect(js).toContain('static {');
  });

  it('reports a syntax error, which is what the editor shows', () => {
    expect(() => toJs('const = ;', 'pipis')).toThrow(/Unexpected|Missing|Expected/);
  });
});

describe('the pages that a server renders', () => {
  const repo = join(import.meta.dirname, '../../..');

  // A server reads the pages as data that the build wrote (`pages.json`), and makes the models again with the little that is in packages/docs-kit/src/handler.ts.
  it.each([false, true])('are the pages that were written, as models again (a single page: %s)', (single) => {
    const { pages } = loadPages({
      root: repo,
      docs: 'docs',
      siteTitle: 'Site',
      repoHome: 'https://example.test/r',
      repoUrl: 'https://example.test/r/blob/main',
      jsxImportSource: 'pipis',
      single,
    });
    const data: PagesData = JSON.parse(JSON.stringify(pagesData(pages, single)));
    const restored = pagesOf(data);
    expect(restored.length).toBe(pages.length);
    // The data is the same when it is written again, and what the functions answer is the same: the links from each page to each page of the site.
    expect(pagesData(restored, single)).toEqual(data);
    const urls = data.nav.flatMap((s) => s.items.map((i) => i.url));
    for (const [at, page] of pages.entries()) {
      const again = restored[at];
      expect(again?.url).toBe(page.url);
      for (const url of urls) expect(again?.href(url), `${page.url} to ${url}`).toBe(page.href(url));
      expect(again?.current?.url).toBe(page.current?.url);
      expect(again?.merged?.length).toBe(page.merged?.length);
    }
  });

  it('can be told where the files they read are', () => {
    const { pages } = loadPages({ root: repo, docs: 'docs', siteTitle: 'Site', repoHome: 'r', repoUrl: 'u', jsxImportSource: 'pipis' });
    expect(pagesOf(pagesData(pages, false), '/elsewhere')[0]?.sourceRoot).toBe('/elsewhere');
  });
});
