// Markdown to the HTML of a page, at build time. The conventions are those of docs/authoring.md: a `live` block becomes a running example,
// a link to another page keeps working (`x.md` becomes `x.html`), and a heading has the anchor GitHub gives it, so the same Markdown is
// right on both.
import { posix } from 'node:path';
import { Marked, type Tokens } from 'marked';
import { escapeHtml, highlight } from './code.ts';
import { anchorOf, blocksOf, parseInfo, type DocBlock } from '../tools/docs.ts';

export interface Heading {
  depth: number;
  id: string;
  /** The heading as plain text. */
  text: string;
}

export interface RenderContext {
  /** The page's Markdown file, relative to the docs folder: `guide/lifecycle.md`. */
  file: string;
  /** Where the repository's files outside the docs are, for a link to `../LLM.md`. */
  repoUrl: string;
  /** The way from the page to the site's root: `../`. */
  root: string;
  /** A `live` block as HTML. */
  example: (block: DocBlock, code: string) => string;
  /** Blocks whose language is one of these words are given to the function instead of being shown: ```` ```demo ````. */
  directives: Record<string, (body: string, ctx: RenderContext) => string>;
}

export interface Rendered {
  html: string;
  headings: Heading[];
  /** The first `#` heading. */
  title: string;
  examples: DocBlock[];
}

/** The page a Markdown file becomes, relative to the site: `README.md` is the index of its folder. */
export function pageUrl(file: string): string {
  return file.replace(/(^|\/)README\.md$/, '$1index.md').replace(/\.md$/, '.html');
}

/** `target` as a link from `from`, both being site paths. */
export function relativeUrl(from: string, target: string): string {
  const rel = posix.relative(posix.dirname(from), target);
  return rel === '' ? posix.basename(target) : rel;
}

const plain = (html: string) =>
  html
    .replace(/<[^>]*>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');

/** A page's Markdown as HTML, with the headings it has and the live examples in it. */
export function render(markdown: string, ctx: RenderContext): Rendered {
  const headings: Heading[] = [];
  const seen = new Map<string, number>();
  const examples: DocBlock[] = [];
  // The reader of blocks in tools/docs.ts is the one the tests use, so a block means the same thing to the site and to the checks.
  const blocks = blocksOf(markdown, ctx.file).filter((b) => b.kind === 'live');
  let next = 0;
  let title = '';

  const marked = new Marked({
    gfm: true,
    renderer: {
      heading({ tokens, depth, text }: Tokens.Heading) {
        const base = anchorOf(text);
        const count = seen.get(base) ?? 0;
        seen.set(base, count + 1);
        const id = count === 0 ? base : `${base}-${count}`;
        const html = this.parser.parseInline(tokens);
        if (depth === 1 && !title) title = plain(html);
        if (depth === 2 || depth === 3) headings.push({ depth, id, text: plain(html) });
        const anchor = depth > 1 ? `<a class="anchor" href="#${id}" aria-label="Link to this section" data-pagefind-ignore>#</a>` : '';
        return `<h${depth} id="${id}">${html}${anchor}</h${depth}>\n`;
      },
      code({ text, raw }: Tokens.Code) {
        // The token keeps only the first word of the info string, and the block reader wants all of it.
        const info = (/^\s*(?:`{3,}|~{3,})([^\n]*)/.exec(raw)?.[1] ?? '').trim();
        const { language, flags } = parseInfo(info, ctx.file);
        const directive = ctx.directives[language];
        if (directive) return directive(text.trim(), ctx);
        if (flags.has('live')) {
          const block = blocks[next++];
          if (!block) throw new Error(`${ctx.file}: a live block was not read`);
          examples.push(block);
          return ctx.example(block, highlight(block.code, block.language));
        }
        return `<div class="code">${highlight(text, language)}</div>\n`;
      },
      link({ href, title: hint, tokens }: Tokens.Link) {
        const text = this.parser.parseInline(tokens);
        const attrs = hint ? ` title="${escapeHtml(hint)}"` : '';
        return `<a href="${escapeHtml(link(href, ctx))}"${attrs}>${text}</a>`;
      },
    },
  });
  return { html: marked.parse(markdown, { async: false }), headings, title, examples };
}

/** Where a link in a page goes on the site. A page of the docs is a page of the site; any other file of the repository is on its host. */
function link(href: string, ctx: RenderContext): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('#') || href.startsWith('/')) return href;
  const [path = '', anchor] = href.split('#');
  const resolved = posix.normalize(posix.join(posix.dirname(ctx.file), path));
  const hash = anchor === undefined ? '' : `#${anchor}`;
  if (resolved.startsWith('..')) return `${ctx.repoUrl}/${resolved.replace(/^(\.\.\/)+/, '')}${hash}`;
  if (!resolved.endsWith('.md')) return href;
  return relativeUrl(pageUrl(ctx.file), pageUrl(resolved)) + hash;
}
