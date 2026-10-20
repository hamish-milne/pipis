// The documentation site built with islands only: the page's script mounts the islands in it and does not hydrate the page, and the islands are
// made again in the browser, with the ordinary build of the library. `vp build --config site/islands.config.ts`. The components are the same.
import { defineConfig } from 'vite-plus';
import { docsSite } from './vite-plugin.ts';

export default defineConfig({ plugins: [docsSite({ render: 'islands' })] });
