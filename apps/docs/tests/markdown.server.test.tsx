/** @jsxImportSource pipis */
import { readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked, type MarkedToken } from 'marked';
import { describe, expect, it } from 'vite-plus/test';
import { createElement } from 'pipis';
import { renderToString } from 'pipis/server';
import { markdownFiles } from '@pipis/docs-kit/blocks';
import { Markdown, renderToken, type MarkdownRenderer } from '../src/markdown.tsx';

// The Markdown component runs with `pipis` as the server's build (the `server` project in vite.config.ts), as it does when the site is built.
// The repository, which has the documentation that the component is run over.
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const render = (content: string, renderer?: MarkdownRenderer) => renderToString(<Markdown content={content} renderer={renderer} />).html;

/** HTML as markup alone: no whitespace between tags or at the end of code (marked ends a code block with a newline), and the quotes that a Markdown parser writes as references written as they are. */
const flat = (html: string) =>
  html
    .replace(/&(quot|#39);/g, (_m, name: string) => (name === 'quot' ? '"' : "'"))
    .replace(/\s+<\/code>/g, '</code>')
    .replace(/>\s+</g, '><')
    .replace(/\s+/g, ' ')
    .trim();

describe('the Markdown component', () => {
  it('makes elements of blocks and inline text', () => {
    expect(render('# Title\n\nA *little* **bold** `code` and ~~gone~~ text.\n\n---\n')).toBe(
      '<h1>Title</h1><p>A <em>little</em> <strong>bold</strong> <code>code</code> and <del>gone</del> text.</p><hr>',
    );
  });

  it('makes lists, ordered ones from where they start, and loose ones with paragraphs', () => {
    expect(render('- a\n- b\n')).toBe('<ul><li>a</li><li>b</li></ul>');
    expect(render('3. x\n4. y\n')).toBe('<ol start="3"><li>x</li><li>y</li></ol>');
    expect(render('1. x\n2. y\n')).toBe('<ol><li>x</li><li>y</li></ol>');
    expect(render('- a\n\n- b\n')).toBe('<ul><li><p>a</p></li><li><p>b</p></li></ul>');
    expect(render('- a\n  - nested\n')).toBe('<ul><li>a<ul><li>nested</li></ul></li></ul>');
  });

  it('makes a table with its alignment', () => {
    expect(render('| a | b |\n|:-|-:|\n| 1 | **2** |\n')).toBe(
      '<table><thead><tr><th align="left">a</th><th align="right">b</th></tr></thead><tbody><tr><td align="left">1</td><td align="right"><strong>2</strong></td></tr></tbody></table>',
    );
    expect(render('| a |\n|-|\n| 1 |\n')).toBe('<table><thead><tr><th>a</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>');
  });

  it('makes a link and an image, with a title only when there is one', () => {
    expect(render('[x](/a) [y](/b "T") ![i](/c.png) ![j](/d.png "U")')).toBe(
      '<p><a href="/a">x</a> <a href="/b" title="T">y</a> <img src="/c.png" alt="i"> <img src="/d.png" alt="j" title="U"></p>',
    );
  });

  it('makes a blockquote and a code block, with its language', () => {
    expect(render('> **Tip.** read\n')).toBe('<blockquote><p><strong>Tip.</strong> read</p></blockquote>');
    expect(render('```ts\nconst a = 1 < 2;\n```\n')).toBe('<pre><code class="language-ts">const a = 1 &lt; 2;</code></pre>');
    expect(render('```\nplain\n```\n')).toBe('<pre><code>plain</code></pre>');
  });

  it('shows a character reference as the character, and escapes it once', () => {
    expect(render('a &amp; b &lt;c&gt; &quot;d&quot; &#39;e&#39; &copy; 1 < 2 & 3')).toBe(
      '<p>a &amp; b &lt;c&gt; "d" \'e\' \u00a9 1 &lt; 2 &amp; 3</p>',
    );
    expect(render('`a &amp; b`')).toBe('<p><code>a &amp;amp; b</code></p>');
    expect(render('\\<b\\>')).toBe('<p>&lt;b&gt;</p>');
  });

  it('writes the HTML an author wrote as it is, which inline is whole elements and not their pieces', () => {
    expect(render('<div class="x">hi</div>\n')).toContain('<div class="x">hi</div>');
    expect(render('a <kbd>k</kbd> b')).toBe('<p>a <kbd>k</kbd> b</p>');
    expect(render('**a <kbd>k</kbd>** b')).toBe('<p><strong>a <kbd>k</kbd></strong> b</p>');
    expect(render('# A <i>b</i>')).toBe('<h1>A <i>b</i></h1>');
  });

  it('writes a task list item with its box', () => {
    expect(render('- [x] done\n- [ ] todo\n')).toBe(
      '<ul><li><input type="checkbox" checked="" disabled="">done</li><li><input type="checkbox" disabled="">todo</li></ul>',
    );
  });

  it('is given tokens already read, or the text', () => {
    const tokens = marked.lexer('# Hi\n');
    expect(renderToString(<Markdown tokens={tokens} />).html).toBe('<h1>Hi</h1>');
  });

  it('lets a renderer make an element of its own for a token, and hand the rest back', () => {
    const renderer: MarkdownRenderer = (token: MarkedToken) =>
      token.type === 'heading'
        ? createElement('h2', { className: `was-h${token.depth}`, children: token.text })
        : renderToken(token, renderer);
    expect(render('# Hi\n\ntext\n', renderer)).toBe('<h2 class="was-h1">Hi</h2><p>text</p>');
  });

  it('refuses a token it has no element for, naming it', () => {
    expect(() => renderToString(<Markdown tokens={[{ type: 'mystery', raw: '' }]} />)).toThrow("'mystery'");
  });
});

describe('the Markdown of the documentation', () => {
  // marked makes HTML of the same Markdown; the component's elements are that HTML, so every page of the documentation is a test of it.
  it.each(markdownFiles(join(repo, 'docs')).map((f) => [relative(repo, f).replace(/\\/g, '/'), f] as const))(
    'is the HTML marked makes of %s',
    (_name, file) => {
      const text = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
      const got = flat(render(text));
      const want = flat(marked.parse(text, { async: false }));
      let at = 0;
      while (at < got.length && got[at] === want[at]) at++;
      // Where they first differ, which a whole page of markup would not say.
      expect({ got: got.slice(Math.max(0, at - 40), at + 80), want: want.slice(Math.max(0, at - 40), at + 80) }).toEqual({
        got: want.slice(Math.max(0, at - 40), at + 80),
        want: want.slice(Math.max(0, at - 40), at + 80),
      });
    },
  );
});
