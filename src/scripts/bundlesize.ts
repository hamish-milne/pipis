/// <reference lib="es2019" />
/// <reference types="node" />
import { build } from 'rolldown';
import path from 'node:path';
import process from 'node:process';
import zlib from 'node:zlib';

const modules: [string, string[]][] = [
  ['core', ['createElement', 'textNode']],
  ['reactive', ['reactive', 'select', 'constant', 'subscribeWithCatch']],
  ['dynamic', ['List', 'OneOf', 'If', 'Effect', 'Watch', 'Suspense', 'ErrorBoundary', 'Portal', 'PortalTarget', 'Helmet']],
];

function buildEntryPoint(moduleExports: [string, string[]][]) {
  const importStatements = moduleExports.map(
    ([moduleName, exports]) => `import { ${exports.join(', ')} } from "../pipis/${moduleName}.ts";`,
  );
  const exportArray = `export const $ = [${moduleExports.flatMap(([, exports]) => exports).join(', ')}]`;
  return [...importStatements, exportArray].join('\n');
}

for (let i = 0; i < modules.length; i++) {
  const sliced = modules.slice(0, i + 1);
  const entryPoint = buildEntryPoint(sliced);
  // Get minified bundle
  const minifiedBundle = await build({
    input: `data:text/javascript,${encodeURIComponent(entryPoint)}`,
    output: {
      format: 'esm',
      minify: true,
    },
    plugins: [
      {
        name: 'resolve-data-url-imports',
        resolveId(source, importer) {
          // Check if the current file being imported is coming from a data URL
          // AND check if the source path is relative (starts with ./ or ../)
          if (importer && importer.startsWith('\0rolldown/data-url:') && source.startsWith('.')) {
            // Re-route the relative import directly from your chosen real folder path
            const resolvedPath = path.resolve(process.cwd(), source);
            return resolvedPath;
          }

          return null; // Let other plugins or Rollup core handle non-data-url files
        },
      },
    ],
  });
  const { code } = minifiedBundle.output[0];

  const gzipped = zlib.gzipSync(code);

  console.log(gzipped.length);
}
