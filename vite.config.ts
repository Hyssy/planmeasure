/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { defineConfig, type Plugin } from 'vite'

/**
 * Builds the offline helper (dist/sw.js) for the installable desktop app: a list
 * of the app's files to keep on each computer, and a version that changes
 * whenever any of them do. OCR files (large) are kept only once used.
 */
function offlineHelper(): Plugin {
  let outDir = 'dist'
  return {
    name: 'cyclomeasure-offline-helper',
    apply: 'build',
    configResolved(c) {
      outDir = c.build.outDir
    },
    closeBundle() {
      const files: string[] = []
      const walk = (dir: string) => {
        for (const name of readdirSync(dir)) {
          const p = join(dir, name)
          if (statSync(p).isDirectory()) walk(p)
          else files.push('/' + relative(outDir, p).split('\\').join('/'))
        }
      }
      walk(outDir)
      const keep = files
        .filter((f) => !['/_headers', '/sw.js', '/index.html'].includes(f) && !f.startsWith('/tesseract/'))
        .sort()
      const precache = ['/', ...keep]
      const template = readFileSync('src/sw-template.js', 'utf8')
      const hash = createHash('sha256').update(template)
      for (const f of ['/index.html', ...keep]) hash.update(f).update(readFileSync(join(outDir, f.slice(1))))
      const sw = template
        .replace('__VERSION__', hash.digest('hex').slice(0, 12))
        .replace('__PRECACHE__', JSON.stringify(precache))
      writeFileSync(join(outDir, 'sw.js'), sw)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), offlineHelper()],
  test: {
    environment: 'node',
  },
})
