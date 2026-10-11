import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Nota: las imágenes que antes iban embebidas en base64 dentro de index.html
// ya fueron extraídas a `public/base64-images/` (commiteadas) y el HTML
// referencia ficheros. El plugin `base64ImagesPlugin` — que reescribía
// index.html y escribía ficheros en `public/` en cada build/dev (efecto
// secundario) — se eliminó por innecesario. Ver `extract-base64-images.cjs`
// en el historial: era el paso único de extracción, ya ejecutado.

export default defineConfig({
  // Rutas relativas a propósito: permite que la misma build funcione en un
  // subdirectorio (GitHub Pages `/proyecto_web/`) y en la raíz (Render).
  base: './',
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    // 'hidden': genera sourcemaps sin añadir el comentario `sourceMappingURL`
    // al final de los bundles (no se exponen al público en producción).
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
      manifest: {
        name: 'Cherry-Bomb - Plataforma Educativa',
        short_name: 'Cherry-Bomb',
        description: 'Plataforma educativa institucional',
        theme_color: '#4F46E5',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: './',
        scope: './',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,woff,ttf,otf}'],
        runtimeCaching: [
          {
            /* Bancos de preguntas PAES: son JSON que el estudiante
               necesita sin conexión. Se guardan en caché al primer uso
               y se actualizan en segundo plano. */
            urlPattern: /\/data\/paes\/[^/?#]+\.json$/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'paes-bancos',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 180 },
              cacheableResponse: { statuses: [0, 200] },
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
