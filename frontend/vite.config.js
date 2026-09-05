import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // Метка сборки — видна в сайдбаре: позволяет глазами проверить,
  // что на устройстве обновилась версия (кэш SW у PWA/TWA бывает липкий)
  define: {
    __BUILD_TS__: JSON.stringify(new Date().toISOString().slice(5, 16).replace('T', ' ')),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-192-maskable.png', 'icons/icon-512-maskable.png', 'push-sw.js'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
        // Главный бандл перевалил за дефолтные 2 МиБ (05.09.2026) — сборка падала,
        // а без precache приложение молча теряло офлайн-режим. Поднимаем потолок.
        // Правильное лечение — code-splitting: бандл давно пора резать (хвост в IDEAS).
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        // Новый SW активируется сразу и берёт контроль над открытыми вкладками —
        // новые версии подхватываются без ручного сброса кеша
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        // Файлы должны идти мимо SPA-фолбэка, иначе сервис-воркер отдаёт index.html
        // вместо самого файла. Симптом всегда один — белый экран: React открывает
        // приложение по несуществующему маршруту.
        //   • /downloads/ и /.well-known/ — скачивание APK и проверка assetlinks;
        //   • /uploads/ — просмотр загруженного скана в новой вкладке. Миниатюра рядом
        //     грузилась нормально: <img> — это не навигация, фолбэк её не трогает,
        //     поэтому баг выглядел необъяснимо («картинка есть, а открыть нельзя»);
        //   • /api/ — прямые ссылки на файлы, отдаваемые бэкендом.
        navigateFallbackDenylist: [/^\/downloads\//, /^\/\.well-known\//, /^\/uploads\//, /^\/api\//],
        // Импортируем push-обработчики в сгенерированный service worker
        importScripts: ['/push-sw.js'],
        runtimeCaching: [
          {
            urlPattern: /\/api\//,
            handler: 'NetworkFirst',
            options: { cacheName: 'api-cache', networkTimeoutSeconds: 10 },
          },
          // Офлайн-ядро: картинки слов — из кэша (webp неизменяемы, ?v= меняет URL при замене).
          // Прогреваются предзагрузкой после логина (offline/store.js prefetchImages)
          {
            urlPattern: /\/uploads\/word-images\/.*\.webp/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'word-images',
              expiration: { maxEntries: 2000, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [0, 200] },
            },
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
    // Порт из реестра экосистемы (seoshkin.tools/infra/ports.json).
    // strictPort: без него vite при занятом порте молча уезжает на соседний,
    // а роутер продолжает стучаться на прежний и отдаёт чужой сайт.
    port: 5184,
    strictPort: true,
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
