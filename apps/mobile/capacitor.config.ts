import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.nearwork.app',
  appName: 'Nearwork',
  webDir: process.env.NEARWORK_NATIVE_BUILD === '1' ? 'dist-native' : 'dist',
  // Keep local debug requests same-site with the HTTP localhost backend.
  ...(process.env.VITE_API_BASE_URL?.startsWith('http://localhost:')
    ? { server: { androidScheme: 'http' } } : {}),
  plugins: { Keyboard: { resizeOnFullScreen: true } },
};

export default config;
