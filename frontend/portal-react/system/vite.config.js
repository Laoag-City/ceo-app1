import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [react({jsxRuntime:'classic'})],
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    outDir: 'system-dist',
    lib: { entry:fileURLToPath(new URL('./main.jsx',import.meta.url)), name:'CityEngineerSystem', formats:['iife'], fileName:()=> 'app.js' },
  },
})
