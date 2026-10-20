/** @jsxImportSource pipis */
// The documentation's page, as one app: the header, the navigation, the article, the way to the next page and the contents. It is written once.
// The server makes it (`renderToString`, in site/server.tsx) and the browser takes it over (site/client.ts), either by hydrating the whole of it or
// by mounting only the islands in it: the page is the same, and which one the browser does is the script's choice.
//
// What is only read is made by the server, from what only the server has (the Markdown, the highlighted code), and the browser takes it as it is:
// those are the components of site/docs.server.tsx, which are stubs in the browser's build. What does something is an island (site/islands.tsx).
import { Island } from 'pipis/islands';
import type { JSXElement } from 'pipis';
import { repoHome, siteTitle } from 'virtual:docs/site';
import type { PageModel } from '../docs-kit/pages.ts';
import { Follow, MenuToggle, SearchButton, ThemeToggle } from './controls.tsx';
import { Article, Navigation, Pager, Toc } from './docs.server.tsx';
import { Footer, Landing } from './landing.server.tsx';

/**
 * The page. `root` is the way from it to the site's root, and `home` is whether it is the home page, which is not documentation but what comes before it.
 * `page` is what the server has of it (its Markdown, its place in the navigation), and the browser does not: the parts that need it are the server's.
 */
export function Page(props: { root: string; home: boolean; page?: PageModel }): JSXElement {
  const { root, home, page } = props;
  const single = __DOCS_PAGES__ === 'single';
  return (
    <>
      <header className="top">
        <Island name="menu" component={MenuToggle} />
        <a className="brand" href={single ? '#' : `${root}index.html`}>
          {siteTitle}
        </a>
        <span className="spacer" />
        {/* On a single page the browser's own find is the search. */}
        {!single && <Island name="search" component={SearchButton} props={{ root }} />}
        <Island name="theme" component={ThemeToggle} />
        <a className="repo" href={repoHome}>
          Source
        </a>
      </header>
      {home ? (
        <main className="home">
          <Landing page={page} />
        </main>
      ) : (
        <>
          <nav className="side" ariaLabel="Documentation">
            <Navigation page={page} />
            {single && <Island name="follow" component={Follow} props={{ kind: 'nav' }} />}
          </nav>
          <main>
            <Article page={page} />
            {!single && (
              <nav className="pager" ariaLabel="Pages">
                <Pager page={page} />
              </nav>
            )}
          </main>
          {!single && (
            <aside className="toc" ariaLabel="On this page">
              <Toc page={page} />
              <Island name="follow" component={Follow} props={{ kind: 'toc' }} />
            </aside>
          )}
        </>
      )}
      <footer className="site-footer">
        <Footer page={page} />
      </footer>
    </>
  );
}
