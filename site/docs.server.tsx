/** @jsxImportSource pipis */
// What the server makes of a page of the documentation that is only read: the navigation, the article from its Markdown, the way to the next page,
// the contents. Each is `Static`: made here, and taken by the browser as it was written. This module is for the server (it is named so), and in the
// browser's build it is replaced by a stub with the same names, so the Markdown reader, the highlighter and the files that a demo shows are not in
// the browser's script. The parts of an article that do something are islands in it (site/blocks.tsx).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { MarkedToken } from 'marked';
import { createElement, type JSXElement } from 'pipis';
import { Static } from 'pipis/hydrate';
import { Island } from 'pipis/islands';
import { highlight } from '../docs-kit/code.ts';
import { pageId, type DocCode, type DocHeading } from '../docs-kit/markdown.ts';
import type { PageModel } from '../docs-kit/pages.ts';
import { Code, Demo, Example } from './blocks.tsx';
import { Markdown, renderToken, renderTokens, type MarkdownRenderer } from './markdown.tsx';

/** Highlighted code, made on the server, as the content of an island. */
const highlighted = (code: string, language: string) => () => <div innerHTML={highlight(code, language)} />;

/** What the documentation makes of Markdown that plain HTML would not: a heading has its anchor, and the code blocks are islands. */
function rendererOf(page: PageModel): MarkdownRenderer {
  const renderer: MarkdownRenderer = (token: MarkedToken) => {
    if (token.type === 'heading') {
      const { id } = token as DocHeading;
      const inner = renderTokens(token.tokens, renderer);
      const anchor =
        token.depth > 1 ? (
          <a className="anchor" href={`#${id}`} ariaLabel="Link to this section" data-pagefind-ignore="">
            #
          </a>
        ) : null;
      return createElement(`h${token.depth}` as 'h1', { id, children: [...inner, anchor] });
    }
    if (token.type === 'code') {
      const { language, block } = token as DocCode;
      if (block) {
        return (
          <Island
            name="example"
            component={Example}
            props={{
              id: block.id,
              title: block.title,
              frame: `${page.root}assets/frame.html#${block.id}`,
              height: block.height ?? 120,
              fixed: block.height !== null,
              width: block.width ?? null,
              jsx: page.jsxImportSource,
              content: highlighted(block.code, block.language),
            }}
          />
        );
      }
      if (language === 'demo') {
        const name = token.text.trim();
        const source = readFileSync(join(page.sourceRoot, 'src/samples', `${name}.tsx`), 'utf8');
        return (
          <Island
            name="demo"
            component={Demo}
            props={{ name, frame: `${page.root}demo/demo-app.html#${name}`, content: highlighted(source, 'tsx') }}
          />
        );
      }
      return <Island name="code" component={Code} props={{ content: highlighted(token.text, language) }} />;
    }
    return renderToken(token, renderer);
  };
  return renderer;
}

export function Navigation(props: { page?: PageModel }): JSXElement {
  const { page } = props;
  return (
    <Static>
      {page &&
        (() => (
          <>
            {page.nav.map((section) => (
              <section>
                <h2>{section.title}</h2>
                <ul>
                  {section.items.map((item) => (
                    <li>
                      <a href={page.href(item.url)} ariaCurrent={page.current?.url === item.url ? 'page' : null}>
                        {item.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </>
        ))}
    </Static>
  );
}

/**
 * The article. What the search reads of a page is what is inside this element, and how it can be narrowed: by the section the page is in, and by
 * its tags.
 */
export function Article(props: { page?: PageModel }): JSXElement {
  const { page } = props;
  return (
    <Static>
      {page &&
        (() =>
          page.merged ? (
            // A site that is a single page has every page on it, each in a section that its links find by name, and has no search to say what is what.
            <>
              {page.merged.map((one) => (
                <article id={pageId(one.file)}>
                  <Markdown tokens={one.tokens} renderer={rendererOf(one)} />
                </article>
              ))}
            </>
          ) : (
            <article
              data-pagefind-body=""
              data-pagefind-filter={`section:${page.section}`}
              data-pagefind-meta={`description:${page.description}`}
            >
              {page.tags.map((tag) => (
                <span hidden data-pagefind-filter={`tag:${tag}`} />
              ))}
              <Markdown tokens={page.tokens} renderer={rendererOf(page)} />
            </article>
          ))}
    </Static>
  );
}

/** The links to the pages before and after this one in the navigation. */
export function Pager(props: { page?: PageModel }): JSXElement {
  const { page } = props;
  return (
    <Static>
      {page &&
        (() => (
          <>
            {page.previous ? (
              <a rel="prev" href={page.href(page.previous.url)}>
                <small>Previous</small>
                {page.previous.title}
              </a>
            ) : (
              <span />
            )}
            {page.next ? (
              <a rel="next" href={page.href(page.next.url)}>
                <small>Next</small>
                {page.next.title}
              </a>
            ) : (
              <span />
            )}
          </>
        ))}
    </Static>
  );
}

/** The headings of the page, as links. */
export function Toc(props: { page?: PageModel }): JSXElement {
  const { page } = props;
  return (
    <Static>
      {page &&
        (() => (
          <>
            {page.headings.length > 0 && <h2>On this page</h2>}
            <ul>
              {page.headings.map((h) => (
                <li data-depth={h.depth}>
                  <a href={`#${h.id}`}>{h.text}</a>
                </li>
              ))}
            </ul>
          </>
        ))}
    </Static>
  );
}
