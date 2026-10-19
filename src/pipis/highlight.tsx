/** @jsxRuntime automatic */
/** @jsxImportSource ./ */
import hljs from 'highlight.js/lib/core';
import typescript from 'highlight.js/lib/languages/typescript';

hljs.registerLanguage('typescript', typescript);

export function HighlightJS({ children, language }: { children: string; language?: string }) {
  return (
    <code
      className={language ? `language-${language}` : undefined}
      ref={(el) => {
        el.textContent = children;
        hljs.highlightElement(el);
      }}
    />
  );
}
