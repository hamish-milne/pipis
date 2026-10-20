/** @jsxImportSource pipis */
// Markdown as pipis elements: a component that is the same on a server and in a browser. It reads the tokens that marked makes and returns an
// element for each, so a page is an ordinary tree of components, not a string of HTML put into one. What an element is made of can be changed
// token by token with a `renderer`, which is how the documentation gives its headings anchors and its code blocks highlighting.
//
// It needs marked, which a browser need not download: a page that is made on a server and is not changed after it has no use for this code in
// the browser, and a bundler that is given the server's build of pipis can leave it out (the code only runs where the Markdown is read).
import type { MarkedToken, Token, Tokens } from 'marked';
import { Lexer, Parser } from 'marked';
import { Fragment, createElement, emptyElement, textNode, type JSXElement } from 'pipis';
import { decodeEntities } from '@pipis/docs-kit/entities';

/** Makes the element for one token. A renderer that does not know a token hands it to {@link renderToken}, which knows them all. */
export type MarkdownRenderer = (token: MarkedToken) => JSXElement;

/** The elements for a token's `tokens`, which is what is inside it. */
export function renderTokens(tokens: Token[] | undefined, renderer: MarkdownRenderer = renderToken): JSXElement[] {
  return ((tokens ?? []) as MarkedToken[]).map((token) => renderer(token));
}

/**
 * What goes inside an element for inline tokens: elements for them, or, if the author wrote HTML among them, that HTML as it is. Inline HTML
 * comes in pieces (`<kbd>`, the text, `</kbd>`), which are not elements and so cannot be made one by one. (The renderer is not asked for these.)
 */
function inline(tokens: Token[] | undefined, renderer: MarkdownRenderer): { children: JSXElement[] } | { innerHTML: string } {
  const hasHtml = (list: Token[] | undefined): boolean =>
    (list ?? []).some((t) => t.type === 'html' || ('tokens' in t && hasHtml(t.tokens)));
  return hasHtml(tokens) ? { innerHTML: Parser.parseInline(tokens ?? []) } : { children: renderTokens(tokens, renderer) };
}

function cells(row: Tokens.TableCell[], tag: 'th' | 'td', renderer: MarkdownRenderer): JSXElement {
  return <tr>{row.map((cell) => createElement(tag, { align: cell.align ?? undefined, ...inline(cell.tokens, renderer) }))}</tr>;
}

/** The element for a token, whose parts are made with `renderer`. */
export function renderToken(token: MarkedToken, renderer: MarkdownRenderer = renderToken): JSXElement {
  switch (token.type) {
    case 'space':
    case 'def':
      return emptyElement;
    case 'hr':
      return <hr />;
    case 'heading':
      return createElement(`h${token.depth}` as 'h1', inline(token.tokens, renderer));
    case 'code': {
      // The token's `lang` is the whole info string (`tsx live title="x"`), and the language is its first word.
      const language = token.lang?.split(/\s/)[0];
      return (
        <pre>
          <code className={language ? `language-${language}` : undefined}>{token.text}</code>
        </pre>
      );
    }
    case 'table':
      return (
        <table>
          <thead>{cells(token.header, 'th', renderer)}</thead>
          <tbody>{token.rows.map((row) => cells(row, 'td', renderer))}</tbody>
        </table>
      );
    case 'blockquote':
      return <blockquote>{renderTokens(token.tokens, renderer)}</blockquote>;
    case 'list':
      return token.ordered
        ? createElement('ol', {
            start: token.start === '' || token.start === 1 ? undefined : token.start,
            children: renderTokens(token.items, renderer),
          })
        : createElement('ul', { children: renderTokens(token.items, renderer) });
    case 'list_item':
      return <li>{renderTokens(token.tokens, renderer)}</li>;
    case 'checkbox':
      return <input type="checkbox" checked={token.checked} disabled />;
    case 'html':
      // Markup the author wrote as it is: the one place text is not escaped.
      return token.block ? <div innerHTML={token.text} /> : <span innerHTML={token.text} />;
    case 'paragraph':
      return createElement('p', inline(token.tokens, renderer));
    case 'text':
      // A text token in a tight list item or a block has the inline tokens that are in it, and in a line has only text.
      return token.tokens ? <Fragment>{renderTokens(token.tokens, renderer)}</Fragment> : textNode(decodeEntities(token.text));
    case 'escape':
      return textNode(decodeEntities(token.text));
    case 'link':
      return createElement('a', { href: token.href, title: token.title || undefined, ...inline(token.tokens, renderer) });
    case 'strong':
      return createElement('strong', inline(token.tokens, renderer));
    case 'em':
      return createElement('em', inline(token.tokens, renderer));
    case 'codespan':
      return <code>{token.text}</code>;
    case 'br':
      return <br />;
    case 'del':
      return createElement('del', inline(token.tokens, renderer));
    case 'image':
      return <img src={token.href} alt={token.text} title={token.title || undefined} />;
    default:
      throw new Error(`The Markdown token '${(token as { type: string }).type}' has no element`);
  }
}

/**
 * Markdown as elements. Give it the `content` as text, or the `tokens` of Markdown that has been read already (which is how the site's build
 * reads a page once, for its headings and its examples, and then makes the page from the same tokens).
 */
export function Markdown(props: { content?: string; tokens?: Token[]; renderer?: MarkdownRenderer }): JSXElement {
  const tokens = props.tokens ?? Lexer.lex(props.content ?? '');
  return Fragment({ children: renderTokens(tokens, props.renderer ?? renderToken) });
}
