import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
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
