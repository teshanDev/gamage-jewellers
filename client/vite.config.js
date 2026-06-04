import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/accounts": "http://localhost:3000",
      "/entries":  "http://localhost:3000",
      "/auth":     "http://localhost:3000",
      "/users":    "http://localhost:3000",
      "/health":   "http://localhost:3000",
    },
  },
})
