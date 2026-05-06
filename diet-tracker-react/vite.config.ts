import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
      manifest: {
        name: 'DietMate Vibe',
        short_name: 'DietMate',
        description: 'Daily diet tracker for IEM management',
        theme_color: '#1B8A6B',
        background_color: '#f0f4f3',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/logo.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      devOptions: {
        enabled: true,
        type: 'module',
        navigateFallback: 'index.html',
      },
    }),
  ],
  server: {
    proxy: {
      '/api': 'http://localhost:5000'
    }
  },
  resolve: {
    alias: {
      'react-transition-group': path.resolve(__dirname, 'node_modules/react-transition-group/cjs/index.js'),
      'react-is': path.resolve(__dirname, 'node_modules/react-is/index.js'),
    },
  },
  optimizeDeps: {
    include: ['xlsx', 'react-is', 'react-transition-group'],
  },
  build: {
    commonjsOptions: {
      include: [/node_modules/],
    },
  },
});
