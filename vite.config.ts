import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import fs from 'fs';
import path from 'path';

// Plugin to handle base64 images in HTML
function base64ImagesPlugin() {
  return {
    name: 'base64-images',
    transformIndexHtml(html) {
      // Replace base64 data URLs with placeholder comments
      // The actual images will be copied to dist/assets and referenced
      const base64Regex = /<img\s+src="data:image\/([^;]+);base64,([^"]+)"([^>]*)>/g;
      
      return html.replace(base64Regex, (match, mimeType, base64Data, rest) => {
        // Generate a unique filename based on the base64 content hash
        const crypto = require('crypto');
        const hash = crypto.createHash('md5').update(base64Data).digest('hex').substring(0, 8);
        const ext = mimeType.split('/')[1] || 'png';
        const filename = `base64-img-${hash}.${ext}`;
        
        // Save the base64 image to public/base64-images/
        const publicDir = path.join(process.cwd(), 'public', 'base64-images');
        if (!fs.existsSync(publicDir)) {
          fs.mkdirSync(publicDir, { recursive: true });
        }
        
        const buffer = Buffer.from(base64Data, 'base64');
        fs.writeFileSync(path.join(publicDir, filename), buffer);
        
        // Return img tag with reference to the saved file
        return `<img src="/base64-images/${filename}"${rest}>`;
      });
    }
  };
}

export default defineConfig({
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
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
    base64ImagesPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'robots.txt'],
      manifest: {
        name: 'INCOA - Plataforma Educativa',
        short_name: 'INCOA',
        description: 'Plataforma educativa institucional',
        theme_color: '#4F46E5',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icons/icon-72.png', sizes: '72x72', type: 'image/png' },
          { src: '/icons/icon-96.png', sizes: '96x96', type: 'image/png' },
          { src: '/icons/icon-128.png', sizes: '128x128', type: 'image/png' },
          { src: '/icons/icon-144.png', sizes: '144x144', type: 'image/png' },
          { src: '/icons/icon-152.png', sizes: '152x152', type: 'image/png' },
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-384.png', sizes: '384x384', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
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
        ],
      },
    }),
  ],
});