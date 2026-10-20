/** @jsxImportSource pipis */
// A whole page of the documentation, as the document a browser is sent: its head (the title, the description, the theme script and the style
// sheet), and its body, which is the layout and the script that makes it live.
import type { JSXElement } from 'pipis';
import type { PageModel } from '../docs-kit/build.ts';
import { THEME_SCRIPT } from '../docs-kit/theme.ts';
import { Page } from './layout.tsx';

export function Document(props: { page: PageModel }): JSXElement {
  const { page } = props;
  return (
    <html lang="en" data-root={page.root} data-jsx={page.jsxImportSource}>
      <head>
        <meta httpEquiv="content-type" content="text/html; charset=utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{`${page.title} · ${page.siteTitle}`}</title>
        <meta name="description" content={page.description} />
        <script innerHTML={THEME_SCRIPT} />
        <link rel="stylesheet" href={page.assets.stylesheet} />
      </head>
      <body>
        <Page page={page} />
        <script type="module" src={page.assets.script} />
      </body>
    </html>
  );
}
