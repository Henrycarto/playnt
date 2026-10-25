import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Favicons and the touch icon are served straight from the brand folder, so there is one copy of each.
  publicDir: '../../assets/brand',
  server: { port: 5173, strictPort: true, proxy: { '/api': 'http://127.0.0.1:4000' } },
  preview: { port: 4173, strictPort: true, proxy: { '/api': 'http://127.0.0.1:4000' } },
});
