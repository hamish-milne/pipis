/** @jsxImportSource pipis */
// The server's entry: the document of a page, for the build to write and the development server to send. The page's head (the title, the
// description, the theme script, the style sheet) and its body, which is the app (site/app.tsx) in the element that the browser takes over, and
// the script that does it. In `hydrate` mode the markup is written so that a browser can hydrate it (`hydratable`), which is what lets the script
// adopt it; in `islands` mode the browser makes the islands again, and the markup has no markers.
import type { JSXElement } from 'pipis';
import { renderToString } from 'pipis/server';
import type { Assets, PageModel } from '../docs-kit/pages.ts';
import { THEME_SCRIPT } from '../docs-kit/theme.ts';
import { Page } from './app.tsx';

export function Document(props: { page: PageModel; assets: Assets }): JSXElement {
  const { page, assets } = props;
  return (
    <html lang="en">
      <head>
        <meta httpEquiv="content-type" content="text/html; charset=utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{`${page.title} · ${page.siteTitle}`}</title>
        <meta name="description" content={page.description} />
        <script innerHTML={THEME_SCRIPT} />
        {assets.styles.map((href) => (
          <link rel="stylesheet" href={href} />
        ))}
      </head>
      <body>
        <div id="app" className="shell" data-root={page.root} data-pages={__DOCS_PAGES__}>
          <Page root={page.root} page={page} />
        </div>
        <script type="module" src={assets.script} />
      </body>
    </html>
  );
}

/** The whole document of a page, as HTML. */
export function render(page: PageModel, assets: Assets): string {
  return renderToString(<Document page={page} assets={assets} />, { hydratable: __DOCS_RENDER__ === 'hydrate' }).html;
}
