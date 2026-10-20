/** @jsxImportSource pipis */
// What the page does that is not reading: the small components of the page that are not about what it says. They are the page's own, in its one
// tree (apps/docs/src/app.tsx), made on the server and hydrated in the browser, so each is written once and has no island of its own.
import { Effect, Watch, reactive, select, type JSXElement } from 'pipis';
import { menuOpen, theme } from './state.ts';

/** The switch between the light and the dark theme. */
export function ThemeToggle(): JSXElement {
  const choose = () => {
    const next = theme.value === 'dark' ? 'light' : 'dark';
    const apply = () => {
      theme.value = next;
    };
    // The change of colours is a fade of the page, where the browser can do one and the reader has not asked for less motion.
    if (document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) document.startViewTransition(apply);
    else apply();
    try {
      localStorage.setItem('docs-theme', next);
    } catch {
      // Storage can be off (a private window, blocked site data): the choice then lasts for the page only.
    }
  };
  return (
    <button type="button" className="icon" data-action="theme" ariaLabel="Switch between the light and dark theme" onclick={choose}>
      <Watch value={theme}>
        {(value) => {
          document.documentElement.dataset.theme = value;
        }}
      </Watch>
      ◐
    </button>
  );
}

/** The button that opens the navigation on a narrow screen. */
export function MenuToggle(): JSXElement {
  return (
    <button
      type="button"
      className="icon menu"
      data-action="menu"
      ariaLabel="Show the navigation"
      onclick={() => (menuOpen.value = !menuOpen.value)}
    >
      <Watch value={menuOpen}>{(open) => document.body.classList.toggle('menu-open', open)}</Watch>☰
    </button>
  );
}

/** The search button, and the keys that open the search from anywhere. The dialog itself is loaded when it is first wanted. */
export function SearchButton(props: { root: string }): JSXElement {
  const open = () => void import('./search.tsx').then(({ openSearch }) => openSearch(props.root));
  return (
    <button type="button" className="search-button" data-action="search" ariaLabel="Search the documentation" onclick={open}>
      <Effect>
        {() => {
          const onkey = (event: KeyboardEvent) => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
              event.preventDefault();
              open();
            }
          };
          addEventListener('keydown', onkey);
          return () => removeEventListener('keydown', onkey);
        }}
      </Effect>
      Search <kbd>Ctrl K</kbd>
    </button>
  );
}

/** The button that copies the code of the block it is in. A block that is being edited copies what is in the editor. */
export function CopyButton(): JSXElement {
  const label = reactive('Copy');
  return (
    <button
      type="button"
      className="copy"
      data-copied={select(label, (l) => l === 'Copied')}
      onclick={async (event) => {
        const block = event.target.closest('.code, .example-code');
        const text = block?.querySelector('textarea')?.value ?? block?.querySelector('pre')?.textContent ?? '';
        try {
          await navigator.clipboard.writeText(text.replace(/\n$/, ''));
          label.value = 'Copied';
        } catch {
          label.value = 'Not copied';
        }
        setTimeout(() => (label.value = 'Copy'), 1500);
      }}
    >
      {label}
    </button>
  );
}

/**
 * Marks the link of the section being read: in the page's contents, the heading that is at the top (`toc`), and on a site that is a single page, in
 * the navigation, the page that is (`nav`). It shows nothing: it is there for what it does.
 */
export function Follow(props: { kind: 'toc' | 'nav' }): JSXElement {
  const toc = props.kind === 'toc';
  return (
    <Effect>
      {() => {
        const links = new Map<string, HTMLAnchorElement>();
        for (const a of document.querySelectorAll<HTMLAnchorElement>(toc ? '.toc a' : '.side a'))
          links.set(decodeURIComponent(a.hash.slice(1)), a);
        if (links.size === 0 || typeof IntersectionObserver === 'undefined') return undefined;
        const visible = new Set<string>();
        const targets = [...document.querySelectorAll<HTMLElement>(toc ? 'article h2[id], article h3[id]' : 'article[id]')];
        const mark = (a: HTMLAnchorElement, on: boolean) => {
          if (toc) a.toggleAttribute('data-active', on);
          else if (on) a.setAttribute('aria-current', 'page');
          else a.removeAttribute('aria-current');
        };
        const observer = new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (entry.isIntersecting) visible.add(entry.target.id);
              else visible.delete(entry.target.id);
            }
            // A heading is a point, so the first in the band is the one being read; a section is long, and the one that is being read is the last to have
            // started (the one before it has not finished, and is still in the band above it).
            const current = (toc ? targets : [...targets].reverse()).find((t) => visible.has(t.id));
            for (const [id, a] of links) mark(a, id === current?.id);
          },
          { rootMargin: '0px 0px -70% 0px' },
        );
        for (const t of targets) observer.observe(t);
        return () => observer.disconnect();
      }}
    </Effect>
  );
}
