import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Явно указываем файлы — workbox включит sw.js в precache
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
        runtimeCaching: [
          {
            urlPattern: /\/api\//,
            handler: 'NetworkFirst',
            options: { cacheName: 'api-cache', networkTimeoutSeconds: 10 },
          },
        ],
      },
      manifest: {
        name: 'Deutsch Lernen',
        short_name: 'Deutsch',
        description: 'Учи немецкий язык — карточки, диктант, разговорник',
        // Золотой акцент приложения
        theme_color: '#C9A54A',
        background_color: '#111111',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        lang: 'ru',
        // Chrome требует two purpose-записи: any + maskable раздельно
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        // Ярлыки быстрого запуска (Android long-press)
        shortcuts: [
          { name: 'Сегодня', short_name: 'Сегодня', url: '/', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
          { name: 'Словарь', short_name: 'Словарь', url: '/vocabulary', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
        ],
        // Снимки экрана — нужны для Google Play через PWABuilder
        screenshots: [],
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
