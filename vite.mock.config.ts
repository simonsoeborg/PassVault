import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Design preview of the renderer in an ordinary browser, against synthetic data.
// The Electron build defines __PASSVAULT_MOCK__ as false, so none of this ships.
export default defineConfig({
  root: resolve('src/renderer'),
  plugins: [react()],
  define: { __PASSVAULT_MOCK__: 'true' },
  server: { port: 5199, strictPort: true },
})
