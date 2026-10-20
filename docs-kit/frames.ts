// The frame of a live example, and what it runs. An example is run in an iframe of its own, which is the only place that example code runs: it
// imports the library by the page's import map, so the code that a reader edits is run as the code the site built is. This makes the files of
// the frame, as strings, for the build to write and the dev server to serve: the example modules, the library as modules, the frame page and
// the scripts that run it.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rolldown } from 'rolldown';
import type { DocBlock } from '../tools/docs.ts';
import { THEME_SCRIPT } from './theme.ts';
import { toJs } from './transform.ts';

const here = dirname(fileURLToPath(import.meta.url));

export interface FrameOptions {
  /** The repository. */
  root: string;
  /** What JSX compiles to calls of, for the examples. */
  jsxImportSource: string;
  /** The library, as modules the examples can import: the import map's specifiers and the files they are served from. */
  library: { files: Record<string, string>; imports: Record<string, string> };
  /** A module with `mount(module, container): () => void`, which runs an example's default export in the frame. */
  adapter: string;
}

/** Bundles `input` into modules, in memory. */
async function bundleToMemory(input: Record<string, string>, external: string[]): Promise<Record<string, string>> {
  const build = await rolldown({ input, platform: 'browser', logLevel: 'warn', external, transform: { target: 'es2022' } });
  try {
    const { output } = await build.generate({ format: 'esm', minify: true, entryFileNames: '[name].js' });
    return Object.fromEntries(output.flatMap((chunk) => (chunk.type === 'chunk' ? [[chunk.fileName, chunk.code]] : [])));
  } finally {
    await build.close();
  }
}

function frame(options: FrameOptions): string {
  const imports = { ...options.library.imports, 'docs-adapter': './adapter.js' };
  // The library's specifiers are served from `lib/`; the map is relative to this file.
  const resolved = Object.fromEntries(Object.entries(imports).map(([k, v]) => [k, v.startsWith('./') ? v : `./${v}`]));
  return (
    '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    `<title>Example</title><script>${THEME_SCRIPT}</script>` +
    `<script type="importmap">${JSON.stringify({ imports: resolved })}</script>` +
    '<link rel="stylesheet" href="frame.css"></head><body><div id="root"></div><script type="module" src="frame.js"></script></body></html>\n'
  );
}

/** The files of the frame, by their path in the site's `assets/` folder. */
export async function frameFiles(options: FrameOptions, examples: DocBlock[]): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  for (const block of examples) files[`examples/${block.id}.js`] = toJs(block.code, options.jsxImportSource);
  for (const [name, content] of Object.entries(options.library.files)) files[name] = content;
  files['frame.html'] = frame(options);
  files['frame.css'] = readFileSync(join(here, 'frame.css'), 'utf8');
  const specifiers = [...Object.keys(options.library.imports), 'docs-adapter'];
  Object.assign(
    files,
    await bundleToMemory({ frame: join(here, 'client/frame.ts'), adapter: join(options.root, options.adapter) }, specifiers),
  );
  return files;
}
