// The documentation site as a single page, made live with islands only: both of the choices that the site has, in one configuration.
// `vp build --config single-islands.config.ts`.
import { defineConfig } from 'vite-plus';
import { docsSite } from './src/vite-plugin.ts';

export default defineConfig({ plugins: [docsSite({ render: 'islands', pages: 'single' })] });
