/** @jsxImportSource pipis */
// What the documentation makes of Markdown that plain HTML would not: a heading has its anchor, a code block is highlighted, a `live` block is
// a running example in a frame of its own, and a `demo` block is a whole app. Everything else is the Markdown component's.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { MarkedToken } from 'marked';
import { createElement, type JSXElement } from 'pipis';
import type { DocBlock } from '../tools/docs.ts';
import { highlight } from '../docs-kit/code.ts';
import type { DocCode, DocHeading } from '../docs-kit/markdown.ts';
import { renderToken, renderTokens, type MarkdownRenderer } from './markdown.tsx';

/** Highlighted code, as the HTML that the editor's grammars make of it. It is made on the server and shown as it is. */
function Code(props: { code: string; language: string }): JSXElement {
  return <div className="code" innerHTML={highlight(props.code, props.language)} />;
}

/** A live example: its frame, its code, and the places that the page's script puts its buttons and a problem. */
function Example(props: { block: DocBlock; root: string }): JSXElement {
  const { block, root } = props;
  return (
    <figure className="example" id={`example-${block.id}`} data-height={block.height}>
      <figcaption>
        <span>{block.title}</span>
        <span className="example-actions">
          <button type="button" data-action="edit" hidden>
            Edit
          </button>
          <button type="button" data-action="reset" hidden>
            Reset
          </button>
        </span>
      </figcaption>
      <div className="example-preview" data-pagefind-ignore="">
        <iframe
          loading="lazy"
          title={block.title}
          src={`${root}assets/frame.html#${block.id}`}
          style={{ height: `${block.height ?? 120}px`, maxWidth: block.width ? `${block.width}px` : undefined }}
        />
      </div>
      <div className="example-code" innerHTML={highlight(block.code, block.language)} />
      <p className="example-error" role="alert" hidden />
      <template data-pagefind-ignore="">{block.code}</template>
    </figure>
  );
}

/** A demo app of src/samples in a frame, with its source below. */
function Demo(props: { name: string; root: string; sourceRoot: string }): JSXElement {
  const source = readFileSync(join(props.sourceRoot, 'src/samples', `${props.name}.tsx`), 'utf8');
  return (
    <div className="demo" data-pagefind-ignore="">
      <iframe loading="lazy" title={`${props.name} demo`} src={`${props.root}demo-app.html#${props.name}`} />
      <details>
        <summary>Source: src/samples/{props.name}.tsx</summary>
        <Code code={source} language="tsx" />
      </details>
    </div>
  );
}

/** The renderer of a page of the documentation. `root` is the way from the page to the site's root, and `sourceRoot` the repository. */
export function docsRenderer(root: string, sourceRoot: string): MarkdownRenderer {
  const renderer: MarkdownRenderer = (token: MarkedToken) => {
    if (token.type === 'heading') {
      const { id } = token as DocHeading;
      const inner = renderTokens(token.tokens, renderer);
      const anchor =
        token.depth > 1 ? (
          <a className="anchor" href={`#${id}`} ariaLabel="Link to this section" data-pagefind-ignore="">
            #
          </a>
        ) : null;
      return createElement(`h${token.depth}` as 'h1', { id, children: [...inner, anchor] });
    }
    if (token.type === 'code') {
      const { language, block } = token as DocCode;
      if (block) return <Example block={block} root={root} />;
      if (language === 'demo') return <Demo name={token.text.trim()} root={root} sourceRoot={sourceRoot} />;
      return <Code code={token.text} language={language} />;
    }
    return renderToken(token, renderer);
  };
  return renderer;
}
