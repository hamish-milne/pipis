/** @jsxImportSource pipis */
// The chrome of a page of the documentation: the header, the navigation, the contents of the page, and the way to the previous and next
// pages. It is written in pipis, and run once for each page when the site is built (`site/build.ts` mounts it in a DOM and reads the HTML).
import type { JSXElement } from 'pipis';
import type { NavItem, NavSection } from '../docs-kit/nav.ts';
import type { PageModel } from '../docs-kit/build.ts';

function Navigation(props: { nav: NavSection[]; page: PageModel }): JSXElement {
  return (
    <nav className="side" aria-label="Documentation">
      {props.nav.map((section) => (
        <section>
          <h2>{section.title}</h2>
          <ul>
            {section.items.map((item) => (
              <li>
                <a href={props.page.href(item.url)} aria-current={props.page.current?.url === item.url ? 'page' : null}>
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
    <nav className="pager" aria-label="Pages">
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
    <aside className="toc" aria-label="On this page">
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
        <button type="button" className="icon menu" data-action="menu" aria-label="Show the navigation">
          ☰
        </button>
        <a className="brand" href={page.href('index.html')}>
          {page.siteTitle}
        </a>
        <span className="spacer" />
        <button type="button" className="search-button" data-action="search" aria-label="Search the documentation">
          Search <kbd>Ctrl K</kbd>
        </button>
        <button type="button" className="icon" data-action="theme" aria-label="Switch between the light and dark theme">
          ◐
        </button>
        <a className="repo" href={page.repoHome}>
          Source
        </a>
      </header>
      <Navigation nav={page.nav} page={page} />
      <main>
        {/* What the search reads of a page is what is inside this element. */}
        <article
          data-pagefind-body=""
          ref={(el) => {
            el.innerHTML = page.html;
          }}
        />
        <Pager previous={page.previous} next={page.next} page={page} />
      </main>
      <Contents page={page} />
    </div>
  );
}
