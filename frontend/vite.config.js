import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-192-maskable.png', 'icons/icon-512-maskable.png', 'push-sw.js'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
        // Новый SW активируется сразу и берёт контроль над открытыми вкладками —
        // новые версии подхватываются без ручного сброса кеша
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        // Импортируем push-обработчики в сгенерированный service worker
        importScripts: ['/push-sw.js'],
        runtimeCaching: [
          {
            urlPattern: /\/api\//,
            handler: 'NetworkFirst',
            options: { cacheName: 'api-cache', networkTimeoutSeconds: 10 },
          },
        ],
      },
      manifest: {
        id: '/',
        name: 'Deutsch Lernen',
        short_name: 'DeutschLernen',
        description: 'Учи немецкий язык — карточки, диктант, разговорник',
        theme_color: '#C9A54A',
        background_color: '#111111',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        lang: 'de',
        categories: ['education'],
        // Chrome требует отдельных записей any + maskable
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          // Отдельные maskable с безопасными полями — иначе Android обрежет края буквы
          { src: '/icons/icon-192-maskable.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Сегодня', short_name: 'Сегодня', url: '/', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
          { name: 'Словарь', short_name: 'Словарь', url: '/vocabulary', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      '/api': 'http://localhost:8090',
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.js'],
  },
})
