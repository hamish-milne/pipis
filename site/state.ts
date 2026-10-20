// What the page's components share. They are one app, so what is here is one value for the page: the theme that a button changes is the theme
// that every example's frame is told of.
import { IS_CLIENT, reactive } from 'pipis';

/** The page's theme. The head of the page has set it before anything is painted (docs-kit/theme.ts), and this follows what it set. */
export const theme = reactive<'light' | 'dark'>('light');

/** Whether the navigation is open, on a screen too narrow to show it beside the page. */
export const menuOpen = reactive(false);

if (IS_CLIENT) theme.value = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
