// The search dialog, over the index that Pagefind builds from the finished pages. Loaded when a reader first opens it, and the index
// itself is fetched by Pagefind in pieces, as the words are typed.

interface PagefindResult {
  data(): Promise<{ url: string; excerpt: string; meta: { title?: string } }>;
}

interface Pagefind {
  options(options: Record<string, unknown>): Promise<void>;
  search(query: string): Promise<{ results: PagefindResult[] }>;
}

let dialog: HTMLDialogElement | undefined;
let pagefind: Promise<Pagefind> | undefined;

function load(root: string): Promise<Pagefind> {
  // Not a literal: the index is written after the page's script is built, and sits beside the pages.
  pagefind ??= import(/* @vite-ignore */ new URL(`${root}pagefind/pagefind.js`, location.href).href).then(async (module: Pagefind) => {
    await module.options({ baseUrl: new URL(root, location.href).pathname });
    return module;
  });
  return pagefind;
}

/** The excerpt marks the matches with `<mark>`; everything else in it is text. */
function excerptOf(html: string): DocumentFragment {
  const template = document.createElement('template');
  template.innerHTML = html;
  for (const element of template.content.querySelectorAll('*')) {
    if (element.tagName !== 'MARK') element.replaceWith(...element.childNodes);
  }
  return template.content;
}

export function openSearch(root: string) {
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.className = 'search';
    dialog.innerHTML =
      '<form method="dialog"><input type="search" placeholder="Search the documentation" aria-label="Search" autocomplete="off" />' +
      '<button class="search-close" aria-label="Close search">Esc</button></form><ul class="search-results" aria-live="polite"></ul>';
    document.body.append(dialog);
    const input = dialog.querySelector('input');
    const list = dialog.querySelector('ul');
    let latest = 0;
    input?.addEventListener('input', async () => {
      const query = input.value.trim();
      const mine = ++latest;
      if (!list) return;
      if (!query) {
        list.textContent = '';
        return;
      }
      const found = await (await load(root)).search(query);
      const items = await Promise.all(found.results.slice(0, 8).map((r) => r.data()));
      // Typing has gone on while the answer was coming; it is for an earlier word.
      if (mine !== latest) return;
      list.textContent = '';
      if (items.length === 0) {
        const none = document.createElement('li');
        none.className = 'search-none';
        none.textContent = `Nothing found for “${query}”.`;
        list.append(none);
      }
      for (const item of items) {
        const li = document.createElement('li');
        const a = document.createElement('a');
        // Pagefind answers with the page's path from the host's root, the site's own path (the `baseUrl` it was given) included.
        a.href = item.url;
        const title = document.createElement('strong');
        title.textContent = item.meta.title ?? item.url;
        const excerpt = document.createElement('span');
        excerpt.append(excerptOf(item.excerpt));
        a.append(title, excerpt);
        li.append(a);
        list.append(li);
      }
    });
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog?.close();
    });
  }
  dialog.showModal();
  dialog.querySelector('input')?.focus();
}
