// The pages of a site, read: the Markdown of a folder as models that an app's server renders from, and the live examples found in them. The
// kit knows nothing about the library being documented, nor about how a page is rendered; both are the site's (see docs-kit/vite.ts).
import { readFileSync } from 'node:fs';
import { join, posix, relative } from 'node:path';
import { markdownFiles, type DocBlock } from '../tools/docs.ts';
import { readFrontmatter } from './frontmatter.ts';
import { pageId, parsePage, relativeUrl, pageUrl, type Heading } from './markdown.ts';
import { parseNav, type NavItem, type NavSection } from './nav.ts';
import type { Token } from 'marked';

/** What an app's server is given to make a page. */
export interface PageModel {
  title: string;
  /** The page's Markdown file, relative to the docs folder: `guide/lifecycle.md`. */
  file: string;
  /** This page, relative to the site: `guide/lifecycle.html`. */
  url: string;
  /** The way from this page to the site's root: `../`. */
  root: string;
  /** The page's Markdown, read: what the site makes the content of the page from. */
  tokens: Token[];
  /** The repository's folder, for what a page shows that is not Markdown (the source of a demo). */
  sourceRoot: string;
  /** What the page is about, as text: what its front matter says, or its first paragraph. */
  description: string;
  /** The part of the documentation the page is in: `Guide`. The search can narrow by it. */
  section: string;
  /** The topics of the page, from its front matter. The search can narrow by them. */
  tags: string[];
  /** What JSX compiles to calls of: the examples' library. */
  jsxImportSource: string;
  headings: Heading[];
  nav: NavSection[];
  /** This page's place in the navigation, if it has one. */
  current: NavItem | undefined;
  previous: NavItem | undefined;
  next: NavItem | undefined;
  siteTitle: string;
  /** The repository's address on its host. */
  repoHome: string;
  /** A link from this page to another page of the site. */
  href(url: string): string;
  /**
   * On a site that is a single page, every page of it, in the order of the navigation and then of the files, as the pages they are (their headings
   * and links are named for the one page that they are on). This is the whole site's model, which is the index page and these.
   */
  merged?: PageModel[];
}

/** The script and the style sheets of the site's page, as links from the page that is being made. */
export interface Assets {
  script: string;
  styles: string[];
}

export interface PagesOptions {
  /** The repository, which the paths below are relative to. */
  root: string;
  /** The folder of Markdown, and the `README.md` in it that orders the site. */
  docs: string;
  siteTitle: string;
  /** The repository's page on its host. */
  repoHome: string;
  /** The address of the repository's files, for links from the docs to a file outside them. */
  repoUrl: string;
  /** What JSX compiles to calls of, for the examples: `pipis`. */
  jsxImportSource: string;
  /** The tags that a page may have. A page with another is an error, so that a tag is not made by a typo. Any, if this is not given. */
  tags?: string[];
  /** Whether the site is a single page, with every page of the Markdown on it. Then `loadPages` gives that one page, as the model of the index. */
  single?: boolean;
}

/**
 * The part of the documentation a page is in: what its front matter says, else the section of the navigation it is listed in, else that of
 * a page in its folder (the design decisions are in `adr/`, and the index of them is in the navigation).
 */
export function sectionOf(file: string, given: string | undefined, nav: NavSection[]): string {
  if (given) return given;
  const own = nav.find((s) => s.items.some((i) => i.file === file));
  const folder = posix.dirname(file);
  const neighbour = folder === '.' ? undefined : nav.find((s) => s.items.some((i) => posix.dirname(i.file) === folder));
  return (own ?? neighbour)?.title ?? 'Documentation';
}

/** Every page of the folder, in the order of the files, and the live examples among them. */
export function loadPages(options: PagesOptions): { pages: PageModel[]; examples: DocBlock[] } {
  const { single = false } = options;
  const docs = join(options.root, options.docs);
  const nav = parseNav(readFileSync(join(docs, 'README.md'), 'utf8'));
  const order = nav.flatMap((s) => s.items);
  const pages: PageModel[] = [];
  const examples: DocBlock[] = [];
  for (const path of markdownFiles(docs)) {
    const file = relative(docs, path).replace(/\\/g, '/');
    const url = pageUrl(file);
    const up = posix.relative(posix.dirname(url), '.');
    // On a site that is a single page every page is on it, so the way to the site's root is the same from all of them.
    const root = single || up === '' ? './' : `${up}/`;
    const { data, body } = readFrontmatter(readFileSync(path, 'utf8').replace(/\r\n/g, '\n'), file);
    for (const tag of data.tags) {
      if (options.tags && !options.tags.includes(tag)) {
        throw new Error(`${file}: the tag '${tag}' is not one of the site's tags (${options.tags.join(', ')})`);
      }
    }
    const rendered = parsePage(body, { file, repoUrl: options.repoUrl, single });
    examples.push(...rendered.examples);
    const at = order.findIndex((item) => item.file === file);
    pages.push({
      title: rendered.title || file,
      file,
      url,
      root,
      siteTitle: options.siteTitle,
      repoHome: options.repoHome,
      sourceRoot: options.root,
      tokens: rendered.tokens,
      description: data.description ?? rendered.description,
      section: sectionOf(file, data.section, nav),
      tags: data.tags,
      jsxImportSource: options.jsxImportSource,
      headings: rendered.headings,
      nav,
      current: single ? undefined : order[at],
      previous: !single && at > 0 ? order[at - 1] : undefined,
      next: !single && at >= 0 ? order[at + 1] : undefined,
      href: (target) => (single ? `#${pageId(target)}` : relativeUrl(url, target)),
    });
  }
  if (!single) return { pages, examples };
  // The whole site is the index page, with all the pages on it: the ones that the navigation lists first, in its order, and then the others.
  const listed = order.flatMap((item) => pages.filter((p) => p.file === item.file));
  const merged = [...listed, ...pages.filter((p) => !listed.includes(p))];
  const index = pages.find((p) => p.url === 'index.html') ?? pages[0];
  if (!index) throw new Error('The site has no pages');
  return { pages: [{ ...index, title: options.siteTitle, merged }], examples };
}
