import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['mint-star96.png', 'choremint_app_icon.png'],
      manifest: {
        name: 'ChoreMint',
        short_name: 'ChoreMint',
        description: '가족과 함께하는 할 일 관리 앱',
        theme_color: '#fb923c',
        background_color: '#fef3c7',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'mint-star96.png',
            sizes: '96x96',
            type: 'image/png'
          },
          {
            src: 'choremint_app_icon.png',
            sizes: '1024x1024',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: 'choremint_app_icon.png',
            sizes: '1024x1024',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        // 큰 파일 캐싱 허용 (5MB까지)
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 // 24 hours
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ],
        // Service Worker에 푸시 알림 이벤트 리스너 추가
        importScripts: ['/sw-custom.js']
      },
      devOptions: {
        enabled: true,
        type: 'module'
      }
    })
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
    hmr: {
      host: '10.228.185.250', // Mac의 LAN IP
      clientPort: 5173,
      protocol: 'ws'
    }
  },
})
