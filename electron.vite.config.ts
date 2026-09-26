import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

// The renderer only ever loads its own bundle. Production gets a CSP with no
// inline script, no remote origins and no network access at all; the dev server
// needs inline preamble scripts and a websocket for hot reload.
function contentSecurityPolicy(): Plugin {
  const production = [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "font-src 'self'",
    "img-src 'self' data:",
    "connect-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "object-src 'none'",
  ].join('; ')
  const development = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "img-src 'self' data:",
    "connect-src 'self' ws://localhost:* http://localhost:*",
    "object-src 'none'",
  ].join('; ')
  let isBuild = false
  return {
    name: 'passvault-csp',
    configResolved(config) {
      isBuild = config.command === 'build'
    },
    transformIndexHtml(html) {
      const policy = isBuild ? production : development
      return html.replace('<!-- csp -->', `<meta http-equiv="Content-Security-Policy" content="${policy}" />`)
    },
  }
}

export default defineConfig({
  main: {
    build: {
      // Bundle every dependency so the packaged app ships no node_modules tree.
      externalizeDeps: false,
      rollupOptions: { input: { index: resolve('src/main/index.ts') } },
    },
  },
  preload: {
    build: {
      externalizeDeps: false,
      rollupOptions: {
        input: { index: resolve('src/preload/index.ts') },
        // Sandboxed preload scripts must be CommonJS.
        output: { format: 'cjs', entryFileNames: '[name].js' },
      },
    },
  },
  renderer: {
    root: resolve('src/renderer'),
    build: {
      minify: 'esbuild',
      rollupOptions: {
        input: {
          index: resolve('src/renderer/index.html'),
          quick: resolve('src/renderer/quick.html'),
        },
      },
    },
    plugins: [react(), contentSecurityPolicy()],
    define: { __PASSVAULT_MOCK__: 'false' },
  },
})
