import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'electron-vite'
import solid from 'vite-plugin-solid'

export default defineConfig({
  main: {
    build: {
      externalizeDeps: {
        exclude: ['electron-updater', 'electron-store', '@electron-toolkit/utils', 'smol-toml']
      }
    }
  },
  preload: {},
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [solid(), tailwindcss()],
    optimizeDeps: {
      include: ['debug', 'extend', 'style-to-object', 'inline-style-parser', 'dequal']
    }
  }
})
