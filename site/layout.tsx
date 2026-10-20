/** @jsxImportSource pipis */
// The chrome of a page of the documentation: the header, the navigation, the contents of the page, and the way to the previous and next
// pages. It is written in pipis, and rendered to HTML once for each page when the site is built (`site/build.ts` does it as an app's server would, with `renderToString`).
import type { JSXElement } from 'pipis';
import type { NavItem, NavSection } from '../docs-kit/nav.ts';
import type { PageModel } from '../docs-kit/build.ts';
import { docsRenderer } from './docs.tsx';
import { Markdown } from './markdown.tsx';

function Navigation(props: { nav: NavSection[]; page: PageModel }): JSXElement {
  return (
    <nav className="side" ariaLabel="Documentation">
      {props.nav.map((section) => (
        <section>
          <h2>{section.title}</h2>
          <ul>
            {section.items.map((item) => (
              <li>
                <a href={props.page.href(item.url)} ariaCurrent={props.page.current?.url === item.url ? 'page' : null}>
                  {item.title}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </nav>
  );
}

function Pager(props: { previous: NavItem | undefined; next: NavItem | undefined; page: PageModel }): JSXElement {
  const { previous, next, page } = props;
  return (
    <nav className="pager" ariaLabel="Pages">
      {previous ? (
        <a rel="prev" href={page.href(previous.url)}>
          <small>Previous</small>
          {previous.title}
        </a>
      ) : (
        <span />
      )}
      {next ? (
        <a rel="next" href={page.href(next.url)}>
          <small>Next</small>
          {next.title}
        </a>
      ) : (
        <span />
      )}
    </nav>
  );
}

function Contents(props: { page: PageModel }): JSXElement {
  const { headings } = props.page;
  return (
    <aside className="toc" ariaLabel="On this page">
      {headings.length > 0 && <h2>On this page</h2>}
      <ul>
        {headings.map((h) => (
          <li data-depth={h.depth}>
            <a href={`#${h.id}`}>{h.text}</a>
          </li>
        ))}
      </ul>
    </aside>
  );
}

export function Page(props: { page: PageModel }): JSXElement {
  const { page } = props;
  return (
    <div className="shell">
      <header className="top">
        <button type="button" className="icon menu" data-action="menu" ariaLabel="Show the navigation">
          ☰
        </button>
        <a className="brand" href={page.href('index.html')}>
          {page.siteTitle}
        </a>
        <span className="spacer" />
        <button type="button" className="search-button" data-action="search" ariaLabel="Search the documentation">
          Search <kbd>Ctrl K</kbd>
        </button>
        <button type="button" className="icon" data-action="theme" ariaLabel="Switch between the light and dark theme">
          ◐
        </button>
        <a className="repo" href={page.repoHome}>
          Source
        </a>
      </header>
      <Navigation nav={page.nav} page={page} />
      <main>
        {/* What the search reads of a page is what is inside this element, and how it can be narrowed: by the section the page is in, and by its tags. */}
        <article
          data-pagefind-body=""
          data-pagefind-filter={`section:${page.section}`}
          data-pagefind-meta={`description:${page.description}`}
        >
          {page.tags.map((tag) => (
            <span hidden data-pagefind-filter={`tag:${tag}`} />
          ))}
          <Markdown tokens={page.tokens} renderer={docsRenderer(page.root, page.sourceRoot)} />
        </article>
        <Pager previous={page.previous} next={page.next} page={page} />
      </main>
      <Contents page={page} />
    </div>
  );
}
