import { defineConfig } from 'vite'

export default defineConfig({
  // relative asset paths so the build works from a GitHub Pages sub-path or any static host
  base: './',
  build: { target: 'es2022' },
})
