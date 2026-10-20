/** @jsxImportSource pipis */
// Every island of the site, by the name that the page's markup gives it: what the browser's script is given to mount. The page uses an island where
// it is written (`<Island name="theme" component={ThemeToggle} />`), and this is the one place that says which component each name is.
import { Code, Demo, Example } from './blocks.tsx';
import { Follow, MenuToggle, SearchButton, ThemeToggle } from './controls.tsx';

export const islands = {
  menu: MenuToggle,
  search: SearchButton,
  theme: ThemeToggle,
  follow: Follow,
  code: Code,
  example: Example,
  demo: Demo,
};
