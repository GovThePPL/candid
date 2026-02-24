import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

const tentapSrc = resolve(__dirname, '../../node_modules/@10play/tentap-editor/src')

export default defineConfig({
  root: 'src',
  plugins: [react(), viteSingleFile()],
  resolve: {
    alias: {
      // The bridges import BridgeExtension from this deep path — alias it
      // since the package.json "exports" field doesn't expose /src/*
      '@10play/tentap-editor/src/bridges/base': resolve(tentapSrc, 'bridges/base.ts'),
    },
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
})
