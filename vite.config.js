import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Deployed as a GitHub Pages PROJECT site: https://bastien-lp.github.io/BloklyStudy/
  // Every built URL is prefixed with this path. Consequences:
  //   - the dev server is now at http://localhost:5173/BloklyStudy/
  //   - files from public/ referenced in JS must go through `asset()`
  //     (src/lib/assets.js), since Vite does not rewrite plain strings
  // Changing the repository name means changing this value.
  base: '/BloklyStudy/',
})
