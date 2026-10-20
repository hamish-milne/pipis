// What the documentation's build gives the site's code.

/** How the page's script makes the page live: `hydrate` takes over the whole page, `islands` mounts only the islands in it. */
declare const __DOCS_RENDER__: 'hydrate' | 'islands';

/** Whether each Markdown file is a page of the site, or the site is one page with all of them on it. */
declare const __DOCS_PAGES__: 'separate' | 'single';

declare module 'virtual:docs/site' {
  export const siteTitle: string;
  export const repoHome: string;
}
