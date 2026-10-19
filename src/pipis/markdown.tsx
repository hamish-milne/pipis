/** @jsxRuntime automatic */
/** @jsxImportSource ./ */
import { Lexer, type MarkedToken, type Token, type Tokens } from 'marked';
import { createElement, emptyElement, Fragment, textNode, type JSXElement } from './core';

export type MarkdownRenderer = (token: MarkedToken) => JSXElement;

export function renderTokens({ tokens }: { tokens: Token[] }, renderer: MarkdownRenderer): JSXElement[] {
  return (tokens as MarkedToken[]).map((item) => renderer(item));
}

export function tableRow(row: Tokens.TableCell[], renderer: MarkdownRenderer): JSXElement {
  return (
    <tr>
      {row.map((cell) => (
        <td>{renderTokens(cell, renderer)}</td>
      ))}
    </tr>
  );
}

export function renderToken(token: MarkedToken, renderer: MarkdownRenderer = renderToken): JSXElement {
  switch (token.type) {
    case 'space':
      return textNode(' ');
    case 'hr':
      return <hr />;
    case 'heading':
      return createElement(`h${token.depth as 1 | 2 | 3 | 4 | 5 | 6}`, {
        children: renderTokens(token, renderer),
      });
    case 'code':
      return (
        <pre>
          <code className={token.lang ? `language-${token.lang}` : undefined}>{token.text}</code>
        </pre>
      );
    case 'table':
      return (
        <table>
          <thead>{tableRow(token.header, renderer)}</thead>
          <tbody>{token.rows.map((row) => tableRow(row, renderer))}</tbody>
        </table>
      );
    case 'blockquote':
      return <blockquote>{renderTokens(token, renderer)}</blockquote>;
    case 'list':
      return createElement(token.ordered ? 'ol' : 'ul', {
        children: renderTokens({ tokens: token.items }, renderer),
      });
    case 'list_item':
      return <li>{renderTokens(token, renderer)}</li>;
    case 'checkbox':
      return <input type="checkbox" checked={token.checked} disabled />;
    case 'html':
      return <div innerHTML={token.text}></div>;
    case 'def':
      return emptyElement; // Definition tokens are not rendered directly
    case 'paragraph':
      return <p>{renderTokens(token, renderer)}</p>;
    case 'text':
      if (token.tokens) {
        return <Fragment>{renderTokens(token as Tokens.Text & { tokens: MarkedToken[] }, renderer)}</Fragment>;
      }
      return textNode(token.text);
    case 'escape':
      return textNode(token.text);
    case 'link':
      return (
        <a href={token.href} title={token.title ?? undefined}>
          {renderTokens(token, renderer)}
        </a>
      );
    case 'strong':
      return <strong>{renderTokens(token, renderer)}</strong>;
    case 'em':
      return <em>{renderTokens(token, renderer)}</em>;
    case 'codespan':
      return <code>{token.text}</code>;
    case 'br':
      return <br />;
    case 'del':
      return <del>{renderTokens(token, renderer)}</del>;
    case 'image':
      return <img src={token.href} alt={token.text} title={token.title ?? undefined} />;
    default:
      throw new Error(`Unhandled token type: ${(token as MarkedToken).type}`);
  }
}

export function Markdown({ content, renderer }: { content: string; renderer?: MarkdownRenderer }) {
  const tokens = new Lexer().lex(content);
  return Fragment({ children: renderTokens({ tokens }, renderer ?? renderToken) });
}
