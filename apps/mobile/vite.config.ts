import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig(() => ({
  plugins: [svelte({ configFile: false })],
  // The web-only public folder contains the downloadable APK, not native assets.
  build: {
    outDir: process.env.NEARWORK_NATIVE_BUILD === '1' ? 'dist-native' : 'dist',
    copyPublicDir: process.env.NEARWORK_NATIVE_BUILD !== '1',
  },
  server: {
    // Let the API proxy's exact-origin CORS policy handle native preflights.
    cors: false,
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: 'http://127.0.0.1:3000', changeOrigin: true, ws: true },
    },
  },
  preview: { port: 4173, strictPort: true },
}));
