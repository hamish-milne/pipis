/** @jsxImportSource pipis */
// The home page and the footer of every page: what a visitor is shown before the documentation, and after it. They are for the server (see
// docs.server.tsx): the browser takes what was written, and the parts that do something, the install command and the example, are islands
// (site/blocks.tsx).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { JSXElement } from 'pipis';
import { Static } from 'pipis/hydrate';
import { Island } from 'pipis/islands';
import { highlight } from '../docs-kit/code.ts';
import type { PageModel } from '../docs-kit/pages.ts';
import { Code, Example } from './blocks.tsx';

/** The code of the first example of the documentation, which is the one that the home page shows running. */
const COUNTER = `import { reactive, select } from 'pipis';

export default function Counter() {
  const count = reactive(0);
  const label = select(count, (n) => \`Clicked \${n} times\`);
  return <button onclick={() => (count.value = count.value + 1)}>{label}</button>;
}`;

const highlighted = (code: string, language: string) => () => <div innerHTML={highlight(code, language)} />;

/** What the build measured, as the numbers the page says: kilobytes, gzipped, to a tenth. */
function sizes(page: PageModel) {
  const gzip: Record<string, number> = JSON.parse(readFileSync(join(page.sourceRoot, 'tools/size-baseline.json'), 'utf8')).gzip;
  const kb = (name: string) => ((gzip[name] ?? 0) / 1000).toFixed(1);
  return {
    core: kb('A static element (core only)'),
    counter: kb('The counter app'),
    everything: kb('Everything: every export, in one program'),
  };
}

/** Who makes it: the first author of package.json, which is the company (the others are people), and the year that LICENSE says. */
function companyOf(page: PageModel): { name: string; year: string; url?: string } {
  const author: unknown = JSON.parse(readFileSync(join(page.sourceRoot, 'package.json'), 'utf8')).author;
  const license = readFileSync(join(page.sourceRoot, 'LICENSE'), 'utf8');
  return {
    name: String(author).split(' and ')[0] ?? '',
    year: /Copyright \(c\) (\d{4})/.exec(license)?.[1] ?? '',
    // The company's website, for the footer, which links to it when it is set. It is not in package.json, so it is said here.
    url: 'https://neofox.solutions/',
  };
}

/** A line icon, from a path. */
function Icon(props: { d: string }): JSXElement {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d={props.d} />
    </svg>
  );
}

const FEATURES: { icon: string; title: string; text: string }[] = [
  {
    icon: 'M13 2 3 14h9l-1 8 10-12h-9z',
    title: 'Only what changed updates',
    text: 'No diffing, no memoization. A reactive value is bound to the DOM node that shows it, and a change goes there and nowhere else.',
  },
  {
    icon: 'M7.5 4.3 16.5 9.4M21 8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.7zM3.3 7 12 12l8.7-5M12 22V12',
    title: 'Tiny, and measured',
    text: 'Each feature costs what you import and no more. Every size on this page is measured, and a check in CI fails if one grows.',
  },
  {
    icon: 'm16 18 6-6-6-6M8 6l-6 6 6 6',
    title: 'No hooks, no re-renders',
    text: 'A component runs once and returns an element. There are no dependency arrays, no stale closures and no rules of hooks.',
  },
  {
    icon: 'M2 4h20v6H2zM2 14h20v6H2zM6 7h.01M6 17h.01',
    title: 'Server, islands, hydration',
    text: 'The same components render to HTML on a server or at build time, and the browser mounts only the islands, or takes the page over.',
  },
  {
    icon: 'M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1M16 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1',
    title: 'Typed from the DOM',
    text: 'The props of every element are derived from the DOM library types, so a misspelt attribute is an error in your editor, not a surprise in the browser.',
  },
  {
    icon: 'M12 22v-5M9 8V2M15 8V2M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8z',
    title: 'Bring your own state',
    text: 'Use the built-in reactive values, or a Zustand or Redux store, an RxJS Observable or a signal, with one function: adapt.',
  },
];

/** The home page. Its text is what the search reads of it, as it reads the other pages. */
export function Landing(props: { page?: PageModel }): JSXElement {
  const { page } = props;
  return (
    <Static>
      {page &&
        (() => {
          const { core, counter, everything } = sizes(page);
          const docs = (url: string) => page.href(url);
          return (
            <div
              className="landing"
              data-pagefind-body=""
              data-pagefind-filter={`section:${page.section}`}
              data-pagefind-meta={`description:${page.description}`}
            >
              {page.tags.map((tag) => (
                <span hidden data-pagefind-filter={`tag:${tag}`} />
              ))}
              <section className="hero">
                <div className="wrap hero-grid">
                  <div className="hero-copy">
                    <p className="eyebrow">
                      <span className="badge">New</span>
                      Server rendering, islands and hydration
                    </p>
                    <h1>
                      Components that run once.
                      <span className="gradient"> Interfaces that update exactly what changed.</span>
                    </h1>
                    <p className="lead">
                      pipis is a tiny JSX framework with no virtual DOM and no re-rendering. A state change goes straight to the DOM node
                      that shows it, in {core} KB.
                    </p>
                    <div className="cta">
                      <a className="button primary" href={docs('start/getting-started.html')}>
                        Get started
                      </a>
                      <a className="button" href={page.repoHome}>
                        View on GitHub
                      </a>
                    </div>
                    <Island name="code" component={Code} props={{ content: highlighted('npm install pipis', 'bash') }} />
                  </div>
                  <div className="hero-demo">
                    <Island
                      name="example"
                      component={Example}
                      props={{
                        id: 'a-first-component',
                        title: 'A first component',
                        frame: `${page.root}assets/frame.html#a-first-component`,
                        height: 88,
                        fixed: true,
                        width: null,
                        jsx: page.jsxImportSource,
                        content: highlighted(COUNTER, 'tsx'),
                      }}
                    />
                    <p className="hero-note">That is running. Change the code.</p>
                  </div>
                </div>
              </section>

              <section className="wrap stats" aria-label="What it costs">
                <div className="stat">
                  <strong>{core} KB</strong>
                  <span>the core, gzipped</span>
                </div>
                <div className="stat">
                  <strong>{counter} KB</strong>
                  <span>a counter app with reactive state</span>
                </div>
                <div className="stat">
                  <strong>{everything} KB</strong>
                  <span>every export, together</span>
                </div>
                <div className="stat">
                  <strong>0</strong>
                  <span>dependencies</span>
                </div>
              </section>

              <section className="wrap section">
                <h2>Why pipis</h2>
                <p className="section-lead">
                  Write components the way you already do. What is different is what happens after the first run.
                </p>
                <div className="features">
                  {FEATURES.map((feature) => (
                    <div className="card">
                      <span className="tile">
                        <Icon d={feature.icon} />
                      </span>
                      <h3>{feature.title}</h3>
                      <p>{feature.text}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="wrap section">
                <h2>Server first, interactive where it counts</h2>
                <p className="section-lead">One set of components, and you choose how much of the page the browser has to run.</p>
                <div className="modes">
                  <a className="card link" href={docs('guide/server-rendering.html')}>
                    <small>1</small>
                    <h3>Render to HTML</h3>
                    <p>
                      On a server or at build time, with no DOM and nothing for the browser to download. The page is complete with no
                      script.
                    </p>
                  </a>
                  <a className="card link" href={docs('guide/islands.html')}>
                    <small>2</small>
                    <h3>Mount islands</h3>
                    <p>Ship only the components that do something, and leave the rest of the page as the HTML it already is.</p>
                  </a>
                  <a className="card link" href={docs('guide/hydration.html')}>
                    <small>3</small>
                    <h3>Or hydrate the page</h3>
                    <p>Take over what the server wrote, node for node: the focus, the scroll and what was typed stay where they are.</p>
                  </a>
                </div>
              </section>

              <section className="wrap section">
                <h2>Everything is written down</h2>
                <p className="section-lead">
                  Each design decision has its tests and the measurements that could show it wrong. Start where you are.
                </p>
                <div className="docs-grid">
                  {page.nav.slice(0, 4).map((section) => (
                    <div className="card">
                      <h3>{section.title}</h3>
                      <ul>
                        {section.items.map((item) => (
                          <li>
                            <a href={docs(item.url)}>{item.title}</a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>

              <section className="wrap band-wrap">
                <div className="band">
                  <div>
                    <h2>Build the first component in five minutes</h2>
                    <p>Install it, point JSX at it, and write a counter. The guide takes it from there.</p>
                  </div>
                  <a className="button primary" href={docs('start/getting-started.html')}>
                    Get started
                  </a>
                </div>
              </section>
            </div>
          );
        })}
    </Static>
  );
}

/** The foot of every page: where the code is, and who makes it. */
export function Footer(props: { page?: PageModel }): JSXElement {
  const { page } = props;
  const company = page && companyOf(page);
  return (
    <Static>
      {page &&
        (() => (
          <div className="wrap foot">
            <div className="foot-brand">
              <a className="brand" href={page.href('index.html')}>
                {page.siteTitle}
              </a>
              <p>A tiny JSX framework with no virtual DOM and no re-rendering.</p>
            </div>
            <nav className="foot-links" aria-label="Footer">
              <div>
                <h2>Documentation</h2>
                <a href={page.href('start/getting-started.html')}>Get started</a>
                <a href={page.href('guide/reactive-values.html')}>The guide</a>
                <a href={page.href('reference/api.html')}>API reference</a>
                <a href={page.href('adr/index.html')}>Design decisions</a>
              </div>
              <div>
                <h2>Project</h2>
                <a href={page.repoHome}>GitHub</a>
                <a href={`${page.repoHome}/issues`}>Issues</a>
                <a href={`${page.repoHome}/blob/main/LICENSE`}>MIT license</a>
              </div>
            </nav>
            <p className="foot-legal">
              © {company?.year}{' '}
              {company?.url ? (
                <a href={company.url} rel="noopener">
                  {company.name}
                </a>
              ) : (
                company?.name
              )}
              . Released under the MIT license.
            </p>
          </div>
        ))}
    </Static>
  );
}
