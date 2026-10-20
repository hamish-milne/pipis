/** @jsxImportSource pipis */
// The parts of an article that do something: a block of code with its copy button, a live example with its frame, its bar and its editor, and a
// demo app with its source. The article's text is made on the server and taken as it is (`Static`), and these are islands in it: each is a
// component that is made twice, by the server, which writes its markup, and by the browser, which takes it over.
//
// What only the server can make (the highlighted code) is given to an island as a function, `content`. The server calls it, and the props that the
// browser reads back are JSON, in which a function is not, so in the browser it is nothing, and the `Slot` that holds it keeps what was written.
import { Effect, IS_CLIENT, reactive, select, subscribe, type JSXElement } from 'pipis';
import { Slot } from 'pipis/islands';
import { CopyButton } from './controls.tsx';
import { theme } from './state.ts';

/** Content that only the server makes. */
export type Slot = (() => JSXElement) | undefined;

/** Highlighted code, and the button that copies it. */
export function Code(props: { content?: Slot }): JSXElement {
  return (
    <div className="code">
      <Slot>{props.content}</Slot>
      <CopyButton />
    </div>
  );
}

export interface ExampleProps {
  id: string;
  title: string;
  /** Where the example's frame is, from the page. */
  frame: string;
  /** The frame's height in pixels: what it is given, or what it starts as. */
  height: number;
  /** Whether the height was given, and so is not changed by what the frame reports. */
  fixed: boolean;
  width: number | null;
  /** What JSX compiles to calls of, for the editor. */
  jsx: string;
  content?: Slot;
}

/**
 * A live example: the bar above it, its frame, and its code, which is the editor when the reader edits it. The frame is told the theme and what
 * has been written, and tells the page its height and what is wrong with the code, so the three parts share what they need as values.
 */
export function Example(props: ExampleProps): JSXElement {
  const problem = reactive('');
  const editing = reactive(false);
  const height = reactive(props.height);
  let frame: HTMLIFrameElement | undefined;
  let code: HTMLElement | undefined;
  let editor: HTMLElement | undefined;
  let session: Promise<{ reset(): void }> | undefined;

  const send = (message: { type: string; [key: string]: unknown }) =>
    frame?.contentWindow?.postMessage({ docs: true, ...message }, location.origin);

  const edit = () => {
    if (!editor || session) return;
    const host = editor;
    session = import('../docs-kit/client/edit.ts').then(({ startEditing }) => {
      // The editor takes the place of the code in one go, once it is there, and is at least as tall: the example does not shrink while the editor
      // loads and grow when it has.
      host.style.minHeight = `${code?.offsetHeight ?? 0}px`;
      const started = startEditing({
        host,
        // What the example was written as is its code on the page: the editor starts from it.
        source: (code?.querySelector('pre')?.textContent ?? '').replace(/\n$/, ''),
        jsxImportSource: props.jsx,
        run: (js) => send({ type: 'run', code: js }),
        original: () => send({ type: 'original' }),
        report: (message) => (problem.value = message),
      });
      editing.value = true;
      return started;
    });
    session.catch(
      (error: unknown) => (problem.value = `The editor did not load: ${error instanceof Error ? error.message : String(error)}`),
    );
  };

  return (
    <figure className={select(editing, (e) => (e ? 'example editing' : 'example'))} id={`example-${props.id}`} ariaLabel={props.title}>
      <div className="example-bar">
        {/* The bar is before the frame, so it is mounted after it, and the frame is there when this runs. */}
        <Effect>
          {() => {
            const page = frame;
            if (!page) return undefined;
            const onMessage = (event: MessageEvent) => {
              if (event.source !== page.contentWindow || event.origin !== location.origin || event.data?.docs !== true) return;
              if (event.data.type === 'height' && !props.fixed) height.value = Math.max(48, Number(event.data.height));
              else if (event.data.type === 'error') problem.value = String(event.data.message);
              else if (event.data.type === 'ok') problem.value = '';
            };
            addEventListener('message', onMessage);
            const sendTheme = () => send({ type: 'theme', value: theme.value });
            page.addEventListener('load', sendTheme);
            const stop = subscribe(theme, (value) => send({ type: 'theme', value }));
            return () => {
              removeEventListener('message', onMessage);
              page.removeEventListener('load', sendTheme);
              stop();
            };
          }}
        </Effect>
        <div className="example-bar-row">
          <span>{props.title}</span>
          <span className="example-actions">
            {/* Without a script there is nothing to edit with, so on the server the buttons are not shown. */}
            <button type="button" data-action="edit" hidden={IS_CLIENT ? editing : true} onclick={edit}>
              Edit
            </button>
            <button
              type="button"
              data-action="reset"
              hidden={IS_CLIENT ? select(editing, (e) => !e) : true}
              onclick={() => void session?.then((s) => s.reset())}
            >
              Reset
            </button>
          </span>
        </div>
        <p className="example-error" role="alert" hidden={select(problem, (p) => p === '')}>
          {problem}
        </p>
      </div>
      <div className="example-preview" data-pagefind-ignore="">
        {/* An island that is made again in the browser has its frame made there, and a server that writes the page for it leaves the frame out, so that
            the browser does not start to load one that is about to be replaced. A page that is hydrated has the frame that the server wrote. */}
        {(IS_CLIENT || __DOCS_RENDER__ === 'hydrate') && (
          <iframe
            ref={(el: HTMLIFrameElement) => (frame = el)}
            loading="lazy"
            title={props.title}
            src={props.frame}
            style={{ height: select(height, (h) => `${h}px`), maxWidth: props.width ? `${props.width}px` : undefined }}
          />
        )}
      </div>
      <div className="example-code" ref={(el: HTMLElement) => (code = el)}>
        <Slot>{props.content}</Slot>
        <CopyButton />
        <div className="editor-host" ref={(el: HTMLElement) => (editor = el)} />
      </div>
    </figure>
  );
}

/** A demo app in a frame, with its source below. */
export function Demo(props: { name: string; frame: string; content?: Slot }): JSXElement {
  return (
    <div className="demo" data-pagefind-ignore="">
      {(IS_CLIENT || __DOCS_RENDER__ === 'hydrate') && <iframe loading="lazy" title={`${props.name} demo`} src={props.frame} />}
      <details>
        <summary>Source: src/samples/{props.name}.tsx</summary>
        <Code content={props.content} />
      </details>
    </div>
  );
}
