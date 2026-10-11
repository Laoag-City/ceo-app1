import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/service-health/permits': { target: 'http://127.0.0.1:3000', rewrite: () => '/login' },
      '/service-health/queue': { target: 'http://127.0.0.1:5000', rewrite: () => '/log-in.html' },
    },
  },
})
