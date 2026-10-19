// The repository's bundler for tools: one entry given as source text, bundled in memory with Rolldown. It is the bundler an app
// using pipis is likely to have, so the sizes measured with it are the ones an app would see.
import { rolldown } from 'rolldown';

// oxlint-disable-next-line eslint/no-control-regex -- an escape character is what colour codes start with
const ANSI = /\u001b\[[0-9;]*m/g;

export type BundleOptions = {
  /** The source of the entry module. */
  contents: string;
  /** Exact module names to files, so that a program can `import … from 'pipis'`. */
  alias?: Record<string, string>;
  /** How `contents` is read (default 'ts'). */
  type?: 'ts' | 'tsx';
  /** An import source: JSX is compiled to its automatic runtime. */
  jsxImportSource?: string;
  minify?: boolean;
  platform?: 'node' | 'browser';
  format?: 'esm' | 'iife';
  /** The global an `iife` bundle assigns its exports to. */
  globalName?: string;
};

/** The bundle's code. */
export async function bundle(o: BundleOptions): Promise<string> {
  const entryId = `\0bundle-entry.${o.type ?? 'ts'}`;
  const alias = o.alias ?? {};
  const unresolved: string[] = [];
  const build = await rolldown({
    input: entryId,
    platform: o.platform ?? 'browser',
    logLevel: 'warn',
    // A module that cannot be found is an error here, not an external to fail on later.
    onLog: (_level, log) => {
      if (log.code === 'UNRESOLVED_IMPORT') unresolved.push(log.message.replace(ANSI, ''));
    },
    transform: {
      target: 'es2022',
      ...(o.jsxImportSource ? { jsx: { runtime: 'automatic', importSource: o.jsxImportSource } } : {}),
    },
    plugins: [
      {
        name: 'bundle-helper',
        resolveId: (id) => (Object.prototype.hasOwnProperty.call(alias, id) ? alias[id] : id === entryId ? id : null),
        load: (id) => (id === entryId ? { code: o.contents, moduleType: o.type ?? 'ts' } : null),
      },
    ],
  });
  try {
    const out = await build.generate({
      format: o.format ?? 'esm',
      ...(o.globalName ? { name: o.globalName } : {}),
      codeSplitting: false,
      minify: o.minify ?? false,
      comments: !o.minify,
    });
    if (unresolved.length) throw new Error(unresolved.join('\n'));
    const chunk = out.output[0];
    return chunk.code;
  } finally {
    await build.close();
  }
}
