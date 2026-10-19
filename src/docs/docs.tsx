/** @jsxRuntime automatic */
/** @jsxImportSource ../pipis */

import '../samples/styles.css';
import { reactive, select, Effect, Watch, type JSXElement, type Reactive } from '../pipis/index.ts';
import { Markdown, renderToken, renderTokens, type MarkdownRenderer } from '../pipis/markdown.tsx';
import { HighlightJS } from '../pipis/highlight.tsx';

import introduction from './01-introduction.md?raw';
import gettingStarted from './02-getting-started.md?raw';
import reactiveValues from './03-reactive-values.md?raw';
import dynamicUi from './04-dynamic-ui.md?raw';
import comparisonWithReact from './05-comparison-with-react.md?raw';
import utilities from './06-utilities.md?raw';
import patternsAndPitfalls from './07-patterns-and-pitfalls.md?raw';

const content = [introduction, gettingStarted, reactiveValues, dynamicUi, comparisonWithReact, utilities, patternsAndPitfalls].join('\n\n');

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

type TocNode = { slug: string; label: string; depth: number; children: TocNode[] };

function renderToc(nodes: TocNode[], activeSlug: Reactive<string | undefined>): JSXElement {
  return (
    <ul className="space-y-1">
      {nodes.map((node) => (
        <li className="has-data-active:[&>a]:font-medium has-data-active:[&>a]:text-indigo-300 dark:has-data-active:[&>a]:text-indigo-500 [&>a]:data-active:text-indigo-600 dark:[&>a]:data-active:text-indigo-400">
          <a
            href={`#${node.slug}`}
            data-active={select(activeSlug, (slug) => slug === node.slug)}
            className="block truncate rounded-md px-2.5 py-1.5 text-sm text-slate-400 transition hover:bg-slate-900/5 hover:text-slate-900 dark:text-slate-500 dark:hover:bg-white/5 dark:hover:text-white"
          >
            {node.label}
          </a>
          {node.children.length > 0 && <div className="pl-3">{renderToc(node.children, activeSlug)}</div>}
        </li>
      ))}
    </ul>
  );
}

export function Docs() {
  const theme = reactive<'light' | 'dark'>(
    (localStorage.getItem('docs-theme') as 'light' | 'dark' | null) ??
      (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
  );

  function toggleTheme() {
    theme.value = theme.value === 'dark' ? 'light' : 'dark';
  }

  // Assigns each heading a stable, unique anchor id, de-duplicating repeated titles.
  const seenSlugs = new Map<string, number>();
  function headingSlug(label: string) {
    const base = slugify(label);
    const count = seenSlugs.get(base) ?? 0;
    seenSlugs.set(base, count + 1);
    return count === 0 ? base : `${base}-${count}`;
  }

  // Built up as headings are encountered while rendering; nodes are attached under the most
  // recent heading of a shallower depth, so it ends up mirroring the heading hierarchy.
  const tocRoot: TocNode[] = [];
  const tocStack: TocNode[] = [];
  function addTocEntry(depth: number, slug: string, label: string) {
    const node: TocNode = { slug, label, depth, children: [] };
    while (tocStack.length > 0 && (tocStack[tocStack.length - 1]?.depth ?? 0) >= depth) {
      tocStack.pop();
    }
    const parent = tocStack[tocStack.length - 1];
    (parent ? parent.children : tocRoot).push(node);
    tocStack.push(node);
  }

  // Tracks which heading each block-level element "belongs to", to drive the active TOC entry
  // below: an IntersectionObserver watches every block, and whichever intersecting one comes
  // first in document order is considered the currently-read section.
  const activeSlug = reactive<string>();
  let currentHeadingSlug: string | undefined;
  let blockCount = 0;
  const blockInfo = new Map<Element, { slug: string; index: number }>();
  const intersecting = new Set<Element>();
  let observer: IntersectionObserver | undefined;

  function onIntersect(entries: IntersectionObserverEntry[]) {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        intersecting.add(entry.target);
      } else {
        intersecting.delete(entry.target);
      }
    }
    let best: { slug: string; index: number } | undefined;
    for (const el of intersecting) {
      const info = blockInfo.get(el);
      if (!info) continue;
      if (!best || info.index < best.index) {
        best = info;
      }
    }
    if (best) {
      activeSlug.value = best.slug;
    }
  }

  function trackBlock(el: Element) {
    if (!currentHeadingSlug) {
      return;
    }
    blockInfo.set(el, { slug: currentHeadingSlug, index: blockCount++ });
    // Only count a block as "active" while it's within the top 30% of the viewport.
    // The top offset is to account for the fixed header height.
    observer ??= new IntersectionObserver(onIntersect, { rootMargin: '-70px 0px -70% 0px' });
    observer.observe(el);
  }

  const docsRenderer: MarkdownRenderer = (token) => {
    switch (token.type) {
      case 'heading': {
        const label = token.text.replace(/[`*_]/g, '');
        const slug = headingSlug(label);
        addTocEntry(token.depth, slug, label);
        currentHeadingSlug = slug;
        return token.depth === 3 ? (
          <h3 id={slug} ref={trackBlock} className="mt-8 scroll-mt-24 text-lg font-semibold text-slate-800 dark:text-slate-100">
            {renderTokens(token, docsRenderer)}
          </h3>
        ) : (
          <h2
            id={slug}
            ref={trackBlock}
            className="mt-12 scroll-mt-24 border-b border-slate-200 pb-3 text-2xl font-semibold tracking-tight text-slate-900 first:mt-0 dark:border-white/10 dark:text-white"
          >
            {renderTokens(token, docsRenderer)}
          </h2>
        );
      }
      case 'paragraph':
        return (
          <p ref={trackBlock} className="mb-4 text-[15px] leading-7 text-slate-600 dark:text-slate-300">
            {renderTokens(token, docsRenderer)}
          </p>
        );
      case 'list': {
        const items = renderTokens({ tokens: token.items }, docsRenderer);
        return token.ordered ? (
          <ol
            ref={trackBlock}
            className="mb-4 list-decimal space-y-1.5 pl-6 text-[15px] leading-7 text-slate-600 marker:font-medium marker:text-indigo-500 dark:text-slate-300 dark:marker:text-indigo-400"
          >
            {items}
          </ol>
        ) : (
          <ul
            ref={trackBlock}
            className="mb-4 list-disc space-y-1.5 pl-6 text-[15px] leading-7 text-slate-600 marker:text-indigo-500 dark:text-slate-300 dark:marker:text-indigo-400"
          >
            {items}
          </ul>
        );
      }
      case 'strong':
        return <strong className="font-semibold text-slate-900 dark:text-white">{renderTokens(token, docsRenderer)}</strong>;
      case 'codespan':
        return (
          <code className="rounded-md bg-indigo-500/10 px-1.5 py-0.5 font-mono text-[13px] text-indigo-600 dark:bg-indigo-400/10 dark:text-indigo-300">
            {token.text}
          </code>
        );
      case 'link':
        return (
          <a
            href={token.href}
            title={token.title ?? undefined}
            className="text-indigo-600 underline decoration-indigo-300 underline-offset-4 transition hover:text-indigo-500 hover:decoration-indigo-400 dark:text-indigo-400 dark:decoration-indigo-500/60"
          >
            {renderTokens(token, docsRenderer)}
          </a>
        );
      case 'code':
        return (
          // Always dark, regardless of site theme, to match the (dark-only) highlight.js theme.
          <div ref={trackBlock} className="mb-4 overflow-hidden rounded-xl bg-slate-900 ring-1 ring-white/10 scheme-dark">
            {token.lang && <div className="border-b border-white/10 px-4 py-1.5 font-mono text-xs text-slate-400">{token.lang}</div>}
            <pre className="overflow-x-auto p-4 text-[13px] leading-6">
              <HighlightJS language={token.lang}>{token.text}</HighlightJS>
            </pre>
          </div>
        );
      default:
        return renderToken(token, docsRenderer);
    }
  };

  // Built before the sidebar below, so the TOC tree is fully populated by the time it's drawn.
  const article = <Markdown content={content} renderer={docsRenderer} />;
  const toc = renderToc(tocRoot, activeSlug);

  return (
    <div
      className="min-h-screen bg-slate-50 text-slate-900 antialiased transition-colors dark:bg-slate-950 dark:text-slate-100 dark:scheme-dark"
      data-theme={theme}
    >
      <Watch value={theme}>{(value) => localStorage.setItem('docs-theme', value)}</Watch>
      <Effect>{() => () => observer?.disconnect()}</Effect>

      <header className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/80 backdrop-blur dark:border-white/10 dark:bg-slate-950/80">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">🍇</span>
            <span className="font-semibold tracking-tight">pipis</span>
            <span className="text-sm text-slate-400 dark:text-slate-500">docs</span>
          </div>
          <button
            onclick={toggleTheme}
            title="Toggle theme"
            className="rounded-full p-2 text-slate-500 transition hover:bg-slate-900/5 dark:text-slate-400 dark:hover:bg-white/10"
          >
            <span className="dark:hidden">🌙</span>
            <span className="hidden dark:inline">☀️</span>
          </button>
        </div>
      </header>

      <div className="mx-auto flex max-w-5xl items-start gap-10 px-4 py-10">
        <aside className="sticky top-20 hidden h-fit w-56 shrink-0 sm:block">
          <h2 className="px-2.5 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">On this page</h2>
          <nav className="mt-2 flex flex-col border-l border-slate-200 dark:border-white/10">{toc}</nav>
        </aside>

        <main className="min-w-0 flex-1 rounded-2xl bg-white p-8 shadow-xl shadow-slate-200/50 ring-1 ring-slate-200 dark:bg-slate-900 dark:shadow-black/20 dark:ring-white/10 sm:p-10">
          {article}
        </main>
      </div>
    </div>
  );
}

Docs()(document.body);
