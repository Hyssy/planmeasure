# CycloMeasure

Browser-based PDF takeoff and markup tool for construction plans.
PDFs are processed entirely in your browser — nothing is uploaded.

See `CLAUDE.md` for the full project brief and build plan.

## Run it locally

You need [Node.js](https://nodejs.org) 20 or newer.

```bash
npm install
npm run dev
```

Then open http://localhost:5173 in your browser.

## Other commands

- `npm test` — run the unit tests (measurement maths)
- `npm run build` — build the static site into `dist/`
- `npm run lint` — check the code for common mistakes

## Test plans

Put sample PDFs in `test-plans/`. That folder is git-ignored so client drawings never end up in the repo.

## Deploying (Cloudflare Pages)

The site is static files, deployed by Cloudflare straight from this GitHub repo.
Live: https://cyclomeasure.space (also https://planmeasure.jordan-hyslop97.workers.dev)
Every push to `main` publishes a new version automatically.

- Build command: `npm run build`
- Build output directory: `dist`
- Node.js version: 22 (set by `.node-version`)

`public/_headers` sets the site's security policy (it may only load its own files and
never sends data anywhere — plans stay on each user's computer) and caching.

Projects are stored in each user's browser, per web address: projects made on
`localhost` don't appear on the live site. Move them with Project → Export / Import.
