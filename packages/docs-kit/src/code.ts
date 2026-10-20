// Code blocks, highlighted at build time with the same grammars that the editor uses in the browser.
import { renderCodeBlock } from 'prism-code-editor/ssr';
import 'prism-code-editor/prism/languages/bash';
import 'prism-code-editor/prism/languages/css';
import 'prism-code-editor/prism/languages/diff';
import 'prism-code-editor/prism/languages/javascript';
import 'prism-code-editor/prism/languages/json';
import 'prism-code-editor/prism/languages/jsx';
import 'prism-code-editor/prism/languages/markdown';
import 'prism-code-editor/prism/languages/markup';
import 'prism-code-editor/prism/languages/tsx';
import 'prism-code-editor/prism/languages/typescript';
import 'prism-code-editor/prism/languages/yaml';

const ALIASES: Record<string, string> = { sh: 'bash', shell: 'bash', html: 'markup', md: 'markdown', yml: 'yaml' };

/** A block of code as HTML. A language with no grammar is shown as it is. */
export function highlight(code: string, language: string): string {
  return renderCodeBlock({ language: ALIASES[language] ?? language, value: code.replace(/\n$/, ''), tabSize: 2 });
}

export const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
