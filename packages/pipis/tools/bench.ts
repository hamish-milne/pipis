// A micro-benchmark of the operations an app does most, run in real Chromium (jsdom's timings say nothing about a browser's).
//   node packages/pipis/tools/bench.ts
// Numbers depend on the machine, so this is not part of `all` and has no baseline: it is run by hand, before and after a change to
// a hot path, and the two tables go in the commit message. docs/adr/0006 records one run. Set PIPIS_CHROMIUM to use your own Chromium.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { bundle } from './bundle.ts';

const root = fileURLToPath(new URL('..', import.meta.url));

const code = await bundle({
  contents: readFileSync(root + 'tools/bench-app.ts', 'utf8'),
  alias: { pipis: root + 'src/index.ts' },
  format: 'iife',
  globalName: 'bench',
  minify: true,
});

const executablePath = process.env.PIPIS_CHROMIUM;
const browser = await chromium.launch(executablePath ? { executablePath } : {});
try {
  const page = await browser.newPage();
  await page.setContent('<!doctype html><body></body>');
  await page.addScriptTag({ content: code });
  const results: { name: string; unit: string; value: number; note: string }[] = await page.evaluate(() => window.bench.run());
  console.log(`${browser.version()}, median of 9 runs after 2 warm-ups\n`);
  const width = Math.max(...results.map((r) => r.name.length));
  for (const r of results) console.log(`${r.name.padEnd(width)}  ${String(r.value).padStart(10)} ${r.unit.padEnd(3)}  ${r.note}`);
} finally {
  await browser.close();
}

declare global {
  interface Window {
    bench: { run(): { name: string; unit: string; value: number; note: string }[] };
  }
}
