/** @jsxImportSource pipis */
// The search dialog, over the index that Pagefind builds from the finished pages. It is a pipis component that is made when the search is first
// opened (the script that opens it loads this when asked), and the index itself is fetched by Pagefind in pieces, as the words are typed.
//
// A page is tagged when the site is built: it is in one section, and has topics. The dialog shows them as chips that narrow a search (a section
// is one choice, topics add up), with how many pages each would leave, and a chip alone, with nothing typed, lists the pages it has.
import { If, List, ReactiveList, Watch, reactive, select, type JSXElement, type Reactive } from 'pipis';

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

/** What the reader has asked for: the words, one section or none, and any topics. */
interface Ask {
  query: string;
  section: string | null;
  tags: readonly string[];
}

/** A page of the answer, as it is shown. */
interface Item {
  url: string;
  title: string;
  where: string;
  /** Where the words are, with the matches in `<mark>`; or, with no words, what the page is for. */
  html: string;
}

interface Answer {
  /** Whether anything has been asked: with nothing asked there is nothing to list. */
  searching: boolean;
  counts: Record<string, Record<string, number>>;
  items: Item[];
}

/** The ask and its answer in one value: what the chips show is made from both, and a `select` that read one through the other would go stale. */
interface State {
  ask: Ask;
  answer: Answer;
}

interface Chip {
  name: string;
  count: number | null;
  pressed: boolean;
}

let pagefind: Promise<Pagefind> | undefined;

function load(root: string): Promise<Pagefind> {
  // Not a literal: the index is written after the page's script is built, and sits beside the pages.
  pagefind ??= import(/* @vite-ignore */ new URL(`${root}pagefind/pagefind.js`, location.href).href).then(async (module: Pagefind) => {
    await module.options({ baseUrl: new URL(root, location.href).pathname });
    return module;
  });
  return pagefind;
}

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Pagefind's excerpt marks the matches with `<mark>`; every other element in it is taken out, and what is left is text. */
function excerptOf(html: string): string {
  const template = document.createElement('template');
  template.innerHTML = html;
  for (const element of template.content.querySelectorAll('*')) {
    if (element.tagName !== 'MARK') element.replaceWith(...element.childNodes);
  }
  return template.innerHTML;
}

function sectionChips(state: State): Chip[] {
  const counts = state.answer.counts.section ?? {};
  // A section that the search leaves no page in is not offered, unless it is the one chosen.
  const names = Object.keys(counts)
    .filter((name) => (counts[name] ?? 0) > 0 || state.ask.section === name)
    .sort();
  if (names.length === 0) return [];
  return [
    { name: 'All', count: null, pressed: state.ask.section === null },
    ...names.map((name) => ({ name, count: counts[name] ?? 0, pressed: state.ask.section === name })),
  ];
}

function tagChips(state: State): Chip[] {
  const counts = state.answer.counts.tag ?? {};
  const names = Object.keys(counts).filter((name) => (counts[name] ?? 0) > 0 || state.ask.tags.includes(name));
  for (const name of state.ask.tags) if (!names.includes(name)) names.push(name);
  // Most pages first.
  names.sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0) || a.localeCompare(b));
  return names.map((name) => ({ name, count: counts[name] ?? 0, pressed: state.ask.tags.includes(name) }));
}

function Chips(props: { filter: string; label: string; chips: Reactive<readonly Chip[]>; choose: (name: string) => void }): JSXElement {
  return (
    <div className="search-chips" data-filter={props.filter} role="group" ariaLabel={props.label}>
      <ReactiveList items={props.chips} itemKey={(chip) => chip.name}>
        {(chip) => (
          <button
            type="button"
            className="search-chip"
            aria-pressed={select(chip, (c) => String(c.pressed))}
            onclick={() => props.choose(chip.value.name)}
          >
            {select(chip, 'name')}
            <small className="search-count">{select(chip, (c) => c.count ?? '')}</small>
          </button>
        )}
      </ReactiveList>
    </div>
  );
}

let dialog: HTMLDialogElement | undefined;

function SearchDialog(props: { root: string }): JSXElement {
  const state = reactive<State>({ ask: { query: '', section: null, tags: [] }, answer: { searching: false, counts: {}, items: [] } });
  const ask = select(state, 'ask');
  let latest = 0;

  const change = (update: Partial<Ask>) => (state.value = { ...state.value, ask: { ...state.value.ask, ...update } });

  async function run(asked: Ask) {
    const mine = ++latest;
    const pf = await load(props.root);
    const chosen: Record<string, unknown> = {};
    if (asked.section) chosen.section = asked.section;
    // A page must have every topic that is chosen.
    if (asked.tags.length) chosen.tag = { all: [...asked.tags] };
    const searching = asked.query !== '' || asked.section !== null || asked.tags.length > 0;
    // With nothing asked there is nothing to list, but the chips are there to begin with.
    const found = searching ? await pf.search(asked.query === '' ? null : asked.query, { filters: chosen }) : undefined;
    const counts = found ? found.filters : await pf.filters();
    const data = found ? await Promise.all(found.results.slice(0, 10).map((r) => r.data())) : [];
    // Typing has gone on while the answer was coming; it is for an earlier question.
    if (mine !== latest) return;
    const items = data.map((d) => ({
      url: d.url,
      title: d.meta.title ?? d.url,
      where: [...(d.filters.section ?? []), ...(d.filters.tag ?? [])].join(' · '),
      html: asked.query === '' && d.meta.description ? escapeHtml(d.meta.description) : excerptOf(d.excerpt),
    }));
    state.value = { ...state.value, answer: { searching, counts, items } };
  }

  return (
    <dialog
      className="search"
      ref={(el) => (dialog = el)}
      onclick={(event) => {
        if (event.target === event.currentTarget) dialog?.close();
      }}
    >
      {/* The chips are there when the dialog opens, and every change of what is asked is answered. */}
      <Watch value={ask}>{(asked) => void run(asked)}</Watch>
      <form method="dialog">
        <input
          type="search"
          placeholder="Search the documentation"
          ariaLabel="Search"
          autocomplete="off"
          oninput={(event) => change({ query: event.target.value.trim() })}
        />
        <button className="search-close" ariaLabel="Close search">
          Esc
        </button>
      </form>
      <div className="search-filters" hidden={select(state, (s) => sectionChips(s).length === 0 && tagChips(s).length === 0)}>
        <Chips
          filter="section"
          label="Section"
          chips={select(state, sectionChips)}
          choose={(name) => change({ section: name === 'All' || state.value.ask.section === name ? null : name })}
        />
        <Chips
          filter="tag"
          label="Topics"
          chips={select(state, tagChips)}
          choose={(name) => {
            const tags = state.value.ask.tags;
            change({ tags: tags.includes(name) ? tags.filter((t) => t !== name) : [...tags, name] });
          }}
        />
      </div>
      <ul className="search-results" aria-live="polite">
        {/* A row is made again when its text changes (the same page, found for other words), so its parts need not follow anything. */}
        <List items={select(state, (s) => s.answer.items)} itemKey={(item) => `${item.url}|${item.html}`}>
          {(item) => (
            <li>
              <a href={item.url}>
                <strong className="search-title">{item.title}</strong>
                <small className="search-where">{item.where}</small>
                <span className="search-excerpt" innerHTML={item.html} />
              </a>
            </li>
          )}
        </List>
        <If condition={select(state, (s) => s.answer.searching && s.answer.items.length === 0)}>
          <li className="search-none">Nothing found.</li>
        </If>
      </ul>
    </dialog>
  );
}

/** Opens the search, making it the first time. `root` is the way from the page to the site's root, which is where the index is. */
export function openSearch(root: string) {
  if (!dialog) SearchDialog({ root })(document.body);
  dialog?.showModal();
  dialog?.querySelector('input')?.focus();
}
