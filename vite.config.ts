import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    // Reachable from phones on the LAN during development.
    host: true,
    proxy: {
      // The game server (npm run dev:server). xfwd lets it tell the laptop from phones.
      '/ws': { target: 'ws://localhost:3000', ws: true, xfwd: true },
    },
  },
})
