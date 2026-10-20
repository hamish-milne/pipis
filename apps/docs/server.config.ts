// The documentation site for a server to render, and not as files: the build writes the scripts, the frames, the demos and the search index into
// the output folder, and the server's code, with the middleware to render the pages with, beside it (`dist-server`). See the recipe in
// docs/authoring.md. `vp build --config server.config.ts`.
import { defineConfig } from 'vite-plus';
import { docsSite } from './src/vite-plugin.ts';

export default defineConfig({ plugins: [docsSite({ build: 'server' })] });
