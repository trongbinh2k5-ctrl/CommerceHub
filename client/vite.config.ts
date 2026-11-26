import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({ plugins: [react()], server: { allowedHosts: ['mono-brings-appreciation-cabin.trycloudflare.com','materials-nissan-translations-panels.trycloudflare.com'], port: 5173, strictPort: true, proxy: { '/api': { target: process.env.API_TARGET || 'http://127.0.0.1:5000', changeOrigin: true } } }, preview: { port: 4173, strictPort: true, proxy: { '/api': { target: process.env.API_TARGET || 'http://127.0.0.1:5000', changeOrigin: true } } } });



