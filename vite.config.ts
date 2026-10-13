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
  // Inyecta VITE_API_URL como __APP_API_BASE__ para src/app.js (no ESM)
  define: {
    __APP_API_BASE__: JSON.stringify(process.env.VITE_API_URL || ''),
  },
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
          {
            // Bancos de preguntas PAES: se sirven desde la caché y se
            // refrescan en segundo plano, así el simulacro funciona sin
            // conexión después de la primera visita. Como `base` es './',
            // el patrón cubre también el despliegue en subdirectorio.
            urlPattern: /\/data\/paes\/.*\.json$/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'paes-bancos',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 180 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
});
