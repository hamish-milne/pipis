// The script of every page of the documentation. The server wrote the whole page (site/server.tsx), complete and readable with no script; this makes
// it live. With `hydrate` rendering it takes over the page: the nodes the server wrote become the app's, and what is only read is taken as it is. With
// `islands` rendering it leaves the page and mounts only the islands in it. The islands, which are what does something, are the same in both.
import './fonts.css';
import { hydrate } from 'pipis/hydrate';
import { mountIslands } from 'pipis/islands';
import { Page } from './app.tsx';
import { islands } from './islands.tsx';

const app = document.getElementById('app');
if (app) {
  if (__DOCS_RENDER__ === 'hydrate') hydrate(app, Page({ root: app.dataset.root ?? './' }));
  // The islands of the page that was hydrated are its own, and the ones in text that is only read are not: those are mounted now.
  mountIslands(islands, app);
}
