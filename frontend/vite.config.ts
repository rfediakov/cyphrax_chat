import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
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
        // Enable SW in dev for testing; disable if it causes hot-reload issues
        enabled: false,
      },
    }),
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://api:3001',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://api:3001',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
});
