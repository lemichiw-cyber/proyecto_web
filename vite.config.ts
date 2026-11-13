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
    // Sin proxy, Vite sirve index.html (SPA fallback) para /api/* y los POST
    // devuelven 404 -> "error api:404". El proxy manda /api al backend FastAPI.
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: false,
        // El backend marca la cookie como Secure en prod; en dev sobre http
        // hay que permitirla para que la sesión viaje.
        secure: false,
      },
    },
  },
  preview: {
    port: 4173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: false,
        secure: false,
      },
    },
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      cleanupOutdatedCaches: true,
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,woff,ttf,otf}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        // La app es una SPA: cualquier navegación cae en el index precacheado.
        navigateFallback: 'index.html',
        // El service worker se sirve en la raíz del sitio (dist/sw.js), así
        // que la ruta es relativa a él. Con "public/..." el archivo se
        // pedía en /public/push-listener.js (404 en Pages) y el SW no
        // instalaba: sin offline ni push.
        importScripts: ['push-listener.js'],
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
    }),
  ],
});
