import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    // .cache/ can hold other git worktrees of this repo; their tests aren't ours.
    exclude: [...configDefaults.exclude, '.cache/**'],
  },
  server: {
    // Reachable from phones on the LAN during development.
    host: true,
    proxy: {
      // The game server (npm run dev:server). xfwd lets it tell the laptop from phones.
      '/ws': { target: 'ws://localhost:3000', ws: true, xfwd: true },
    },
  },
})
