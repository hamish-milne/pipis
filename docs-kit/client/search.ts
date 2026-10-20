// The search dialog, over the index that Pagefind builds from the finished pages. Loaded when a reader first opens it, and the index
// itself is fetched by Pagefind in pieces, as the words are typed.
//
// A page is tagged when the site is built: it is in one section, and has topics. The dialog shows them as chips that narrow a search (a section
// is one choice, topics add up), with how many pages each would leave, and a chip alone, with nothing typed, lists the pages it has.

interface PagefindData {
  url: string;
  excerpt: string;
  meta: { title?: string; description?: string };
  filters: { section?: string[]; tag?: string[] };
}

interface PagefindResponse {
  results: { data(): Promise<PagefindData> }[];
  /** How many pages each value of each filter would leave, for the search as it is now. */
  filters: Record<string, Record<string, number>>;
}

interface Pagefind {
  options(options: Record<string, unknown>): Promise<void>;
  filters(): Promise<Record<string, Record<string, number>>>;
  search(query: string | null, options?: { filters?: Record<string, unknown> }): Promise<PagefindResponse>;
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

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

/** What the reader has asked for: the words, one section or none, and any topics. */
interface Ask {
  query: string;
  section: string | null;
  tags: Set<string>;
}

export function openSearch(root: string) {
  if (!dialog) dialog = build(root);
  dialog.showModal();
  dialog.querySelector('input')?.focus();
}

function build(root: string): HTMLDialogElement {
  const dialog = document.createElement('dialog');
  dialog.className = 'search';
  dialog.innerHTML =
    '<form method="dialog"><input type="search" placeholder="Search the documentation" aria-label="Search" autocomplete="off" />' +
    '<button class="search-close" aria-label="Close search">Esc</button></form>' +
    '<div class="search-filters" hidden><div class="search-chips" data-filter="section" role="group" aria-label="Section"></div>' +
    '<div class="search-chips" data-filter="tag" role="group" aria-label="Topics"></div></div>' +
    '<ul class="search-results" aria-live="polite"></ul>';
  document.body.append(dialog);

  // The parts of the markup above, which are there.
  const find = <T extends HTMLElement>(selector: string): T => {
    const found = dialog.querySelector<T>(selector);
    if (!found) throw new Error(`The search dialog has no ${selector}`);
    return found;
  };
  const input = find<HTMLInputElement>('input');
  const results = find('ul');
  const filters = find('.search-filters');
  const sections = find('[data-filter=section]');
  const topics = find('[data-filter=tag]');

  const ask: Ask = { query: '', section: null, tags: new Set() };
  let latest = 0;

  function chip(label: string, count: number | undefined, pressed: boolean, onclick: () => void): HTMLButtonElement {
    const button = element('button', 'search-chip', label);
    button.type = 'button';
    button.setAttribute('aria-pressed', String(pressed));
    if (count !== undefined) button.append(element('small', 'search-count', String(count)));
    button.addEventListener('click', onclick);
    return button;
  }

  /** The chips, from how many pages each value would leave for what has been asked. */
  function showChips(counts: Record<string, Record<string, number>>) {
    sections.textContent = '';
    topics.textContent = '';
    const bySection = counts.section ?? {};
    const byTag = counts.tag ?? {};
    // A section that the search leaves no page in is not offered, unless it is the one chosen.
    const sectionNames = Object.keys(bySection)
      .filter((name) => (bySection[name] ?? 0) > 0 || ask.section === name)
      .sort();
    if (sectionNames.length) {
      sections.append(chip('All', undefined, ask.section === null, () => change(() => (ask.section = null))));
      for (const name of sectionNames) {
        sections.append(
          chip(name, bySection[name], ask.section === name, () => change(() => (ask.section = ask.section === name ? null : name))),
        );
      }
    }
    // The topics that are chosen stay, with whatever else the search leaves, most pages first.
    const tagNames = Object.keys(byTag)
      .filter((name) => (byTag[name] ?? 0) > 0 || ask.tags.has(name))
      .sort((a, b) => (byTag[b] ?? 0) - (byTag[a] ?? 0) || a.localeCompare(b));
    for (const name of ask.tags) if (!tagNames.includes(name)) tagNames.push(name);
    for (const name of tagNames) {
      topics.append(
        chip(name, byTag[name], ask.tags.has(name), () => change(() => (ask.tags.has(name) ? ask.tags.delete(name) : ask.tags.add(name)))),
      );
    }
    filters.hidden = !sections.childElementCount && !topics.childElementCount;
  }

  function show(item: PagefindData): HTMLLIElement {
    const li = document.createElement('li');
    const a = document.createElement('a');
    // Pagefind answers with the page's path from the host's root, the site's own path (the `baseUrl` it was given) included.
    a.href = item.url;
    const title = element('strong', 'search-title', item.meta.title ?? item.url);
    const where = element('small', 'search-where', [...(item.filters.section ?? []), ...(item.filters.tag ?? [])].join(' · '));
    const excerpt = element('span', 'search-excerpt');
    // With words, where they are; with only chips, what the page is for.
    if (ask.query === '' && item.meta.description) excerpt.textContent = item.meta.description;
    else excerpt.append(excerptOf(item.excerpt));
    a.append(title, where, excerpt);
    li.append(a);
    return li;
  }

  async function run() {
    const mine = ++latest;
    const pf = await load(root);
    const chosen: Record<string, unknown> = {};
    if (ask.section) chosen.section = ask.section;
    // A page must have every topic that is chosen.
    if (ask.tags.size) chosen.tag = { all: [...ask.tags] };
    const searching = ask.query !== '' || ask.section !== null || ask.tags.size > 0;
    // With nothing asked there is nothing to list, but the chips are there to begin with.
    const found = searching ? await pf.search(ask.query === '' ? null : ask.query, { filters: chosen }) : undefined;
    const counts = found ? found.filters : await pf.filters();
    const items = found ? await Promise.all(found.results.slice(0, 10).map((r) => r.data())) : [];
    // Typing has gone on while the answer was coming; it is for an earlier question.
    if (mine !== latest) return;
    showChips(counts);
    results.textContent = '';
    if (searching && items.length === 0) results.append(element('li', 'search-none', 'Nothing found.'));
    for (const item of items) results.append(show(item));
  }

  function change(update: () => unknown) {
    update();
    void run();
  }

  input.addEventListener('input', () => change(() => (ask.query = input.value.trim())));
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  // The chips are there when the dialog opens.
  void run();
  return dialog;
}
