// What a page does once it is loaded. The page is complete without any of this: the text, the code, the navigation and the examples
// (an iframe each, which is plain HTML) all work with scripts off. This adds the theme switch, the search, editing an example, copying
// code, and the table of contents following the reader.
const root = document.documentElement.dataset.root ?? './';
const jsxImportSource = document.documentElement.dataset.jsx ?? 'react';

function setTheme(value: 'light' | 'dark') {
  document.documentElement.dataset.theme = value;
  try {
    localStorage.setItem('docs-theme', value);
  } catch {
    // Storage can be off (a private window, blocked site data): the choice then lasts for the page only.
  }
  for (const frame of document.querySelectorAll('iframe')) tellFrame(frame, { type: 'theme', value });
}

const currentTheme = () => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');

function tellFrame(frame: HTMLIFrameElement, message: { type: string; [key: string]: unknown }) {
  frame.contentWindow?.postMessage({ docs: true, ...message }, location.origin);
}

function setUpExample(figure: HTMLElement) {
  const frame = figure.querySelector('iframe');
  const host = figure.querySelector<HTMLElement>('.example-code');
  const source = (figure.querySelector('template')?.content.textContent ?? '').replace(/\n$/, '');
  const edit = figure.querySelector<HTMLButtonElement>('[data-action=edit]');
  const reset = figure.querySelector<HTMLButtonElement>('[data-action=reset]');
  const problem = figure.querySelector<HTMLElement>('.example-error');
  if (!frame || !host) return;
  const fixed = figure.dataset.height !== undefined;
  const report = (message: string) => {
    if (!problem) return;
    problem.textContent = message;
    problem.hidden = message === '';
  };
  frame.addEventListener('load', () => tellFrame(frame, { type: 'theme', value: currentTheme() }));
  addEventListener('message', (event: MessageEvent) => {
    if (event.source !== frame.contentWindow || event.origin !== location.origin || event.data?.docs !== true) return;
    if (event.data.type === 'height' && !fixed) frame.style.height = `${Math.max(48, Number(event.data.height))}px`;
    else if (event.data.type === 'error') report(String(event.data.message));
    else if (event.data.type === 'ok') report('');
  });
  if (!edit || !reset) return;
  edit.hidden = false;
  let session: Promise<{ reset(): void }> | undefined;
  edit.addEventListener('click', () => {
    edit.hidden = true;
    reset.hidden = false;
    figure.classList.add('editing');
    edit.setAttribute('aria-busy', 'true');
    session = import('./edit.ts').then(({ startEditing }) =>
      startEditing({
        host,
        source,
        jsxImportSource,
        run: (code) => tellFrame(frame, { type: 'run', code }),
        original: () => tellFrame(frame, { type: 'original' }),
        report,
      }),
    );
    session.catch((error: unknown) => report(`The editor did not load: ${error instanceof Error ? error.message : String(error)}`));
  });
  reset.addEventListener('click', () => void session?.then((s) => s.reset()));
}

function addCopyButtons() {
  for (const block of document.querySelectorAll<HTMLElement>('.code, .example-code')) {
    const button = document.createElement('button');
    button.className = 'copy';
    button.type = 'button';
    button.textContent = 'Copy';
    button.addEventListener('click', async () => {
      // An example being edited copies what is in the editor.
      const text = block.querySelector('textarea')?.value ?? block.querySelector('pre')?.textContent ?? '';
      try {
        await navigator.clipboard.writeText(text.replace(/\n$/, ''));
        button.textContent = 'Copied';
      } catch {
        button.textContent = 'Not copied';
      }
      setTimeout(() => (button.textContent = 'Copy'), 1500);
    });
    block.append(button);
  }
}

/** The contents link of the section being read is marked. */
function followToc() {
  const links = new Map<string, HTMLAnchorElement>();
  for (const a of document.querySelectorAll<HTMLAnchorElement>('.toc a')) links.set(decodeURIComponent(a.hash.slice(1)), a);
  if (links.size === 0 || typeof IntersectionObserver === 'undefined') return;
  const visible = new Set<string>();
  const headings = [...document.querySelectorAll<HTMLElement>('article h2[id], article h3[id]')];
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) visible.add(entry.target.id);
        else visible.delete(entry.target.id);
      }
      const first = headings.find((h) => visible.has(h.id));
      for (const [id, a] of links) a.toggleAttribute('data-active', id === first?.id);
    },
    { rootMargin: '0px 0px -70% 0px' },
  );
  for (const h of headings) observer.observe(h);
}

document.querySelector('[data-action=theme]')?.addEventListener('click', () => setTheme(currentTheme() === 'dark' ? 'light' : 'dark'));
document.querySelector('[data-action=menu]')?.addEventListener('click', () => document.body.classList.toggle('menu-open'));

const search = () => import('./search.ts').then(({ openSearch }) => openSearch(root));
document.querySelector('[data-action=search]')?.addEventListener('click', () => void search());
addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    void search();
  }
});

for (const figure of document.querySelectorAll<HTMLElement>('figure.example')) setUpExample(figure);
addCopyButtons();
followToc();
