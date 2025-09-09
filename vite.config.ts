import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    port: 3000,
    open: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist/client',
    sourcemap: true,
    rollupOptions: {
      input: {
        app: 'src/client/app.ts',
        wallet: 'src/client/wallet.ts'
      },
      output: {
        entryFileNames: '[name].js'
      },
      external: ['bitcoinjs-lib', 'ecpair', 'tiny-secp256k1']
    }
  },
  define: {
    global: 'globalThis',
  },
  optimizeDeps: {
    exclude: ['bitcoinjs-lib', 'ecpair', 'tiny-secp256k1']
  }
})