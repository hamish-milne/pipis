// Editing an example in place. Loaded only when a reader asks to edit one, because it brings the compiler (Sucrase) and the editor with
// it, which together are most of what the documentation costs to download.
import { createEditor } from 'prism-code-editor';
import { defaultCommands, editHistory } from 'prism-code-editor/commands';
import { indentGuides } from 'prism-code-editor/guides';
import 'prism-code-editor/prism/languages/tsx';
import { toJs } from '../transform.ts';

export interface Session {
  /** Puts the original code back and runs it. */
  reset(): void;
}

export interface EditOptions {
  /** The element that holds the code, which the editor takes the place of. */
  host: HTMLElement;
  source: string;
  jsxImportSource: string;
  /** Runs compiled code in the frame. */
  run: (code: string) => void;
  /** Runs the example as the site built it. */
  original: () => void;
  /** Shows a problem with the code, or nothing. */
  report: (message: string) => void;
}

/** What the compiler said, as text. */
const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

export function startEditing({ host, source, jsxImportSource, run, original, report }: EditOptions): Session {
  host.textContent = '';
  const element = document.createElement('div');
  element.className = 'editor';
  host.append(element);

  let timer: ReturnType<typeof setTimeout> | undefined;
  const compile = (code: string) => {
    try {
      const js = toJs(code, jsxImportSource);
      report('');
      run(js);
    } catch (error) {
      // The previous version stays on show: half-typed code is an error for a moment, not a reason to blank the preview.
      report(messageOf(error));
    }
  };

  const editor = createEditor(
    element,
    {
      language: 'tsx',
      value: source,
      lineNumbers: true,
      tabSize: 2,
      onUpdate(code) {
        clearTimeout(timer);
        timer = setTimeout(() => compile(code), 300);
      },
    },
    indentGuides(),
    defaultCommands(),
    editHistory(),
  );
  editor.textarea.setAttribute('aria-label', 'Example code');
  element.dataset.ready = '';

  return {
    reset() {
      clearTimeout(timer);
      editor.setOptions({ value: source });
      report('');
      original();
    },
  };
}
