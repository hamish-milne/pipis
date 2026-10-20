// The documentation site as a single page, with every page of the Markdown on it in the order of the navigation, and the page rendered and made
// live as it is by default. `vp build --config single.config.ts`. There is no search index (the browser's find is the search), and the
// navigation follows the section that is being read.
import { defineConfig } from 'vite-plus';
import { docsSite } from './src/vite-plugin.ts';

export default defineConfig({ plugins: [docsSite({ pages: 'single' })] });
