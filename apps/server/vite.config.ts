import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';
import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { realtimePlugin } from './realtime-plugin.ts';

export default defineConfig(({ mode }) => ({
  plugins: [realtimePlugin({ ...loadEnv(mode, process.cwd(), ''), ...process.env }), sveltekit({
    adapter: adapter(),
    preprocess: vitePreprocess(),
    // Integration servers must not overwrite the running app's generated env modules.
    outDir: process.env.NEARWORK_TEST_OUT_DIR ?? '.svelte-kit',
  })],
  // Native credentialed preflights must reach hooks.server.ts, not Vite's
  // generic development CORS middleware (which omits Allow-Credentials).
  server: { port: 3000, strictPort: true, cors: false },
}));
