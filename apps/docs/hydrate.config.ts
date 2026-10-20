// The documentation site as the tests of it use it: a page for each Markdown file, written as files, and hydrated in the browser. It is what
// `vite.config.ts` says unless that has been pointed at another of the site's configurations to try it (the others are the files beside this).
// `vp build --config hydrate.config.ts`.
import { defineConfig } from 'vite-plus';
import { docsSite } from './src/vite-plugin.ts';

export default defineConfig({ plugins: [docsSite({ render: 'hydrate', pages: 'separate', build: 'static' })] });
