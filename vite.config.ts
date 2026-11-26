import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Reachable from phones on the LAN during development.
    host: true,
    proxy: {
      // The game server (npm run dev:server). xfwd lets it tell the laptop from phones.
      '/ws': { target: 'ws://localhost:3000', ws: true, xfwd: true },
    },
  },
})
