// Copies the support files pdf.js and tesseract.js (OCR) need into public/,
// so they are served with the app — nothing is fetched from a CDN at runtime.
import { cpSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const nm = join(root, 'node_modules')
const pub = join(root, 'public')

// pdf.js: fonts, character maps, image decoders, colour profiles
const pdfDest = join(pub, 'pdfjs')
mkdirSync(pdfDest, { recursive: true })
for (const dir of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) {
  cpSync(join(nm, 'pdfjs-dist', dir), join(pdfDest, dir), { recursive: true })
}

// tesseract.js: worker script, OCR engine (LSTM builds only) and English model
const ocrDest = join(pub, 'tesseract')
mkdirSync(join(ocrDest, 'core'), { recursive: true })
mkdirSync(join(ocrDest, 'lang'), { recursive: true })
cpSync(join(nm, 'tesseract.js', 'dist', 'worker.min.js'), join(ocrDest, 'worker.min.js'))
for (const f of readdirSync(join(nm, 'tesseract.js-core'))) {
  if (f.includes('lstm')) cpSync(join(nm, 'tesseract.js-core', f), join(ocrDest, 'core', f))
}
cpSync(
  join(nm, '@tesseract.js-data', 'eng', '4.0.0_best_int', 'eng.traineddata.gz'),
  join(ocrDest, 'lang', 'eng.traineddata.gz'),
)
console.log('Copied pdf.js and OCR assets to public/')
