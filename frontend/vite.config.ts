import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type ServerOptions } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import basicSsl from '@vitejs/plugin-basic-ssl';

// --- Local HTTPS dev support ---------------------------------------------
// PWA features (service worker, push, getUserMedia, geolocation, install
// prompt) require a "secure context". `http://localhost` qualifies, but
// `http://<lan-ip>` does NOT — which means a phone on the same Wi-Fi cannot
// exercise these features. Running the dev server over HTTPS unlocks them.
//
//  - `VITE_HTTPS=1` enables HTTPS for the dev server and PWA-in-dev.
//  - If mkcert-generated certs exist in ./certs they are used (no browser
//    warnings; works on LAN devices that trust the mkcert root CA).
//  - Otherwise `@vitejs/plugin-basic-ssl` falls back to a self-signed cert
//    (fine on localhost; LAN devices will show a warning AND service workers
//    will refuse to register — install mkcert via scripts/dev-https-setup.sh).
const httpsEnabled = process.env.VITE_HTTPS === '1';
const certDir = path.resolve(__dirname, 'certs');
const certPath = path.join(certDir, 'dev.crt');
const keyPath = path.join(certDir, 'dev.key');
const hasMkcertCerts =
  httpsEnabled && fs.existsSync(certPath) && fs.existsSync(keyPath);

const httpsServer: ServerOptions['https'] | undefined = hasMkcertCerts
  ? {
      cert: fs.readFileSync(certPath),
      key: fs.readFileSync(keyPath),
    }
  : undefined;

// API target for the dev proxy. Inside docker-compose, the API is reachable
// at the service name `api`; on the host it's `http://localhost:3001`.
const apiTarget = process.env.VITE_API_TARGET ?? 'http://api:3001';

export default defineConfig({
  plugins: [
    react(),
    // Add basic-ssl only when HTTPS is requested AND mkcert certs are missing,
    // so that on a fresh checkout developers still get *some* HTTPS.
    ...(httpsEnabled && !hasMkcertCerts ? [basicSsl()] : []),
    VitePWA({
      registerType: 'autoUpdate',
      // Service worker handles push events and background sync
      strategies: 'generateSW',
      includeAssets: ['favicon.ico', 'icons/*.png', 'screenshots/*.png'],
      manifest: {
        name: 'SafeGroup',
        short_name: 'SafeGroup',
        description: 'Family & group real-time location safety app',
        theme_color: '#1e40af',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        id: '/',
        icons: [
          {
            src: '/icons/pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/pwa-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        screenshots: [
          {
            src: '/screenshots/mobile.png',
            sizes: '390x844',
            type: 'image/png',
            label: 'SafeGroup – real-time family location',
          },
          {
            src: '/screenshots/desktop.png',
            sizes: '1280x720',
            type: 'image/png',
            form_factor: 'wide',
            label: 'SafeGroup – desktop view',
          },
        ],
        categories: ['communication', 'navigation', 'utilities'],
        shortcuts: [
          {
            name: 'SOS Alert',
            short_name: 'SOS',
            url: '/?sos=1',
            icons: [{ src: '/icons/sos-96.png', sizes: '96x96', type: 'image/png' }],
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Cache OSM map tiles for offline map viewing
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/tile\.openstreetmap\.org\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'osm-tiles',
              expiration: {
                maxEntries: 500,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /\/api\/v1\/messages/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-messages',
              networkTimeoutSeconds: 5,
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /\/api\/v1\/(rooms|dialogs|contacts)/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-core',
              networkTimeoutSeconds: 5,
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      // Inject service worker registration into the app
      injectRegister: 'auto',
      devOptions: {
        // Enable the SW in dev only when HTTPS is on, so the full PWA surface
        // (push, install prompt, offline) can be tested locally. Disabling
        // by default avoids interference with HMR for everyday work.
        enabled: httpsEnabled,
        type: 'module',
        navigateFallback: 'index.html',
      },
    }),
  ],
  server: {
    // Bind to all interfaces so phones on the LAN can reach the dev server.
    host: httpsEnabled ? true : 'localhost',
    https: httpsServer,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
      '/socket.io': {
        target: apiTarget,
        changeOrigin: true,
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
});
