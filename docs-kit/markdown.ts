// A page's Markdown, read: the tokens a renderer makes the page from, and what the build needs to know about it (its headings, its title,
// its live examples). The conventions are those of docs/authoring.md: a `live` block is a running example, a link to another page keeps
// working (`x.md` becomes `x.html`), and a heading has the anchor GitHub gives it, so the same Markdown is right on both.
//
// The kit stops at tokens. What they become (HTML, or the elements of a UI library) is the site's: see site/markdown.tsx.
import { posix } from 'node:path';
import { Lexer, marked, type Token, type Tokens } from 'marked';
import { decodeEntities } from './entities.ts';
import { anchorOf, blocksOf, parseInfo, type DocBlock } from '../tools/docs.ts';

export interface Heading {
  depth: number;
  id: string;
  /** The heading as plain text. */
  text: string;
}

/** A heading token, with the anchor its page gives it. */
export interface DocHeading extends Tokens.Heading {
  id: string;
}

/** A code token, with what its info string says. */
export interface DocCode extends Tokens.Code {
  /** The language word of the info string (`tsx`), which the token's own `lang` also has. */
  language: string;
  /** The block, if the info string says `live`. */
  block?: DocBlock;
}

export interface PageContext {
  /** The page's Markdown file, relative to the docs folder: `guide/lifecycle.md`. */
  file: string;
  /** Where the repository's files outside the docs are, for a link to `../LLM.md`. */
  repoUrl: string;
}

export interface ParsedPage {
  /** The page's tokens. Headings are {@link DocHeading}s, code is {@link DocCode}, and a link's `href` is where it goes on the site. */
  tokens: Token[];
  /** The `##` and `###` headings, for the page's contents. */
  headings: Heading[];
  /** The first `#` heading, as text. */
  title: string;
  /** The first paragraph, as text. */
  description: string;
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

/** The text of inline tokens, as a reader sees it. */
export function plainText(tokens: Token[]): string {
  return tokens
    .map((t) => {
      // Markup the author wrote is not text.
      if (t.type === 'html') return '';
      if (t.type === 'codespan' || t.type === 'image') return t.text;
      if ('tokens' in t && t.tokens) return plainText(t.tokens);
      return 'text' in t && typeof t.text === 'string' ? decodeEntities(t.text) : '';
    })
    .join('');
}

/** Reads a page's Markdown into tokens. */
export function parsePage(markdown: string, ctx: PageContext): ParsedPage {
  const tokens = Lexer.lex(markdown);
  const headings: Heading[] = [];
  const seen = new Map<string, number>();
  const examples: DocBlock[] = [];
  // The reader of blocks in tools/docs.ts is the one the tests use, so a block means the same thing to the site and to the checks.
  const blocks = blocksOf(markdown, ctx.file).filter((b) => b.kind === 'live');
  let next = 0;
  let title = '';
  let description = '';

  // `walkTokens` returns what the callback returns, for an asynchronous one: this one is not, so there is nothing to wait for.
  void marked.walkTokens(tokens, (token) => {
    if (token.type === 'heading') {
      const base = anchorOf(token.text);
      const count = seen.get(base) ?? 0;
      seen.set(base, count + 1);
      const id = count === 0 ? base : `${base}-${count}`;
      Object.assign(token, { id });
      const text = plainText(token.tokens ?? []);
      if (token.depth === 1 && !title) title = text;
      if (token.depth === 2 || token.depth === 3) headings.push({ depth: token.depth, id, text });
    } else if (token.type === 'code') {
      // The token keeps only the first word of the info string, and the block reader wants all of it.
      const info = (/^\s*(?:`{3,}|~{3,})([^\n]*)/.exec(token.raw)?.[1] ?? '').trim();
      const { language, flags } = parseInfo(info, ctx.file);
      let block: DocBlock | undefined;
      if (flags.has('live')) {
        block = blocks[next++];
        if (!block) throw new Error(`${ctx.file}: a live block was not read`);
        examples.push(block);
      }
      Object.assign(token, { language, block });
    } else if (token.type === 'link') {
      token.href = link(token.href, ctx);
    } else if (token.type === 'paragraph' && !description) {
      description = plainText(token.tokens ?? [])
        .replace(/\s+/g, ' ')
        .trim();
    }
  });
  return { tokens, headings, title, description, examples };
}

/** Where a link in a page goes on the site. A page of the docs is a page of the site; any other file of the repository is on its host. */
function link(href: string, ctx: PageContext): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('#') || href.startsWith('/')) return href;
  const [path = '', anchor] = href.split('#');
  const resolved = posix.normalize(posix.join(posix.dirname(ctx.file), path));
  const hash = anchor === undefined ? '' : `#${anchor}`;
  if (resolved.startsWith('..')) return `${ctx.repoUrl}/${resolved.replace(/^(\.\.\/)+/, '')}${hash}`;
  if (!resolved.endsWith('.md')) return href;
  return relativeUrl(pageUrl(ctx.file), pageUrl(resolved)) + hash;
}
