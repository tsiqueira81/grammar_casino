import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(() => {
    return {
      base: './',
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: {
          '/.netlify/functions': {
            target: 'http://localhost:8888',
            changeOrigin: true,
          },
          '/api': {
            target: 'http://localhost:8888/.netlify/functions',
            changeOrigin: true,
            rewrite: (path) => path.replace(/^\/api/, ''),
          }
        }
      },
      plugins: [react()],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
