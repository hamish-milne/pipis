import { describe, expect, it } from 'vite-plus/test';
import { parseNav } from './nav.ts';
import { pageUrl, relativeUrl, render, type RenderContext } from './markdown.ts';
import { toJs } from './transform.ts';

const context = (file: string, extra: Partial<RenderContext> = {}): RenderContext => ({
  file,
  repoUrl: 'https://example.test/repo/blob/main',
  root: '../',
  example: (block) => `[example ${block.id}]`,
  directives: {},
  ...extra,
});

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

describe('Markdown to a page', () => {
  it('gives a heading the anchor GitHub gives it, so a link works on both', () => {
    const { html, headings, title } = render(
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
    expect(html).toContain('<h2 id="the-axis-class">');
  });

  it('points a link to another page at that page, and one to a file outside the docs at its place on the host', () => {
    const { html } = render(
      '[a](b.md) [c](../start/d.md#x) [e](README.md) [f](../../LLM.md) [g](https://example.test/x.md) [h](#here)',
      context('guide/a.md'),
    );
    expect(html).toContain('href="b.html"');
    expect(html).toContain('href="../start/d.html#x"');
    expect(html).toContain('href="index.html"');
    expect(html).toContain('href="https://example.test/repo/blob/main/LLM.md"');
    expect(html).toContain('href="https://example.test/x.md"');
    expect(html).toContain('href="#here"');
  });

  it('makes a live block an example, and shows a check block and the rest as code', () => {
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
    const { html, examples } = render(markdown, context('a.md'));
    expect(examples.map((b) => b.id)).toEqual(['one']);
    expect(html).toContain('[example one]');
    expect(html).not.toContain('live title');
    expect(html.match(/class="code"/g)).toHaveLength(2);
    expect(html).toContain('let');
  });

  it('gives a block of a directive to it, with where the page is', () => {
    const { html } = render(
      '```demo\ntodo\n```\n',
      context('demos/a.md', { directives: { demo: (body, ctx) => `<b>${body} from ${ctx.root}</b>` } }),
    );
    expect(html).toContain('<b>todo from ../</b>');
  });

  it('escapes what is code', () => {
    const { html } = render('```ts\nconst a = "<b>" && 1;\n```\n', context('a.md'));
    expect(html).not.toContain('<b>');
    expect(html).toContain('&lt;b>');
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
