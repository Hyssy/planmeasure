/*
 * CycloMeasure offline helper (service worker).
 *
 * Keeps a copy of the app on each computer so the installed app opens without
 * internet. It only ever stores the app's own files — never plans or projects
 * (those live in the browser's project storage, as before) — and only talks to
 * this website.
 *
 * The build (vite.config.ts) fills in VERSION and PRECACHE.
 */
const VERSION = '__VERSION__'
const PRECACHE = __PRECACHE__
const APP = `cyclomeasure-app-${VERSION}`
// big engine files (OCR) are kept once used, across versions
const ENGINES = 'cyclomeasure-engines-v1'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(APP).then(async (cache) => {
      // a few at a time; a sign-in redirect (Cloudflare Access) or error means don't install a broken copy
      for (let i = 0; i < PRECACHE.length; i += 8) {
        await Promise.all(
          PRECACHE.slice(i, i + 8).map(async (url) => {
            const res = await fetch(url, { cache: 'reload', redirect: 'manual' })
            if (!res.ok || res.type !== 'basic') throw new Error(`Couldn't fetch ${url}`)
            await cache.put(url, res)
          }),
        )
      }
    }),
  )
  // the new version waits until the app says "reload" (so nobody's work is interrupted)
})

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('cyclomeasure-app-') && k !== APP).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

const usable = (res) => res && res.ok && res.type === 'basic' && !res.redirected

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  // The page itself: online first (so a sign-in or a new version is seen), the stored copy when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(async () => (await caches.match('/', { cacheName: APP })) || Response.error()),
    )
    return
  }

  // App files: stored copy first, then the network.
  event.respondWith(
    (async () => {
      const stored = await caches.match(req, { ignoreSearch: true, ignoreVary: true })
      if (stored) return stored
      const res = await fetch(req)
      // keep engine files once used (OCR language data is large, so it isn't fetched up front)
      if (usable(res) && (url.pathname.startsWith('/tesseract/') || url.pathname.startsWith('/pdfjs/'))) {
        const cache = await caches.open(ENGINES)
        await cache.put(req, res.clone())
      }
      return res
    })(),
  )
})
