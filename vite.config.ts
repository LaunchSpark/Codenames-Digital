import react from '@vitejs/plugin-react'
import { configDefaults, defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
