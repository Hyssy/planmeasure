# PlanMeasure

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
