import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// base: './' uses relative paths, which works for both:
// - GitHub Pages subdirectory deployment (/proyecto_web/)
// - Netlify root domain deployment (https://<site>.netlify.app)
// The verify:build script confirms both scenarios work.

export default defineConfig({
  base: './',
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    // 'hidden' generates sourcemaps without sourceMappingURL comments in bundles
    sourcemap: 'hidden',
    rollupOptions: {
      input: {
        main: 'index.html',
      },
    },
  },
  server: {
    port: 5173,
    open: true,
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      cleanupOutdatedCaches: true,
      // No includeAssets for favicon.ico/robots.txt (don't exist in public/)
      manifest: {
        name: 'Cherry-Bomb - Plataforma Educativa',
        short_name: 'Cherry-Bomb',
        description: 'Organizador personal para estudiantes: agenda, tareas, Pomodoro y música.',
        lang: 'es',
        dir: 'ltr',
        categories: ['education', 'music', 'productivity'],
        theme_color: '#2563eb',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,woff,ttf,otf}'],
        // La app es una SPA: cualquier navegación cae en el index precacheado.
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            // Música de los temas ya descargada: disponible sin conexión.
            // rangeRequests permite servir respuestas parciales de <audio>.
            urlPattern: /\.(?:mp3|m4a|ogg|wav|flac|aac)(?:\?.*)?$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'sakura-audio',
              rangeRequests: true,
              expiration: { maxEntries: 24, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200, 206] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
});