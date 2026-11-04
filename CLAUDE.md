# CycloMeasure — Project Brief for Claude Code

The app is called **CycloMeasure** (renamed from PlanMeasure by Jordan). The header shows the Cyclo wordmark followed by "Measure"; elsewhere it's "CycloMeasure". Internal names stay `planmeasure` (repo, Worker, browser database `planmeasure`, project file format id `planmeasure-project`, local-storage keys) — **don't rename those**: changing the database name would make saved projects disappear.

## Who I am
I'm Jordan, not a developer. I build this app with Claude Code. When you work on this project:
- Explain what you're about to do in plain English before larger changes.
- Work in small steps. Finish one phase, get it working, then stop and tell me how to test it.
- Tell me the exact commands to run (e.g. `npm run dev`) and what I should see.
- Commit to git after each working step with a clear message.
- If something is ambiguous, ask me. Don't guess on measurement maths.

## What the app does
A browser-based PDF takeoff and markup tool for construction plans (architectural, structural, fit-out). Users:
1. Load a plan set (one multi-page PDF or several PDFs).
2. The app reads each sheet, **detects the drawing scale** if one is printed, and **labels each sheet** (sheet number and title from the title block).
3. Users do **takeoffs**: linear, area, perimeter, count, grouped by trade/item.
4. Users add **markups**: clouds, arrows, text, rectangles, highlights.
5. Users export quantities (CSV/Excel) and a marked-up PDF.

## Core principle: everything runs in the browser
- PDFs are **never uploaded to a server**. They're processed locally with pdf.js.
- Projects are saved in the browser (IndexedDB), with export/import as a `.json` project file so work can be shared or backed up. **Exported project files always include the PDFs** (decided by Jordan), base64-encoded and checked with SHA-256 on import, so one file holds everything.
- No backend, no database, no accounts. The site is static files.

## Tech stack (keep it to this unless we agree to change)
- **Vite + React + TypeScript**
- **pdfjs-dist** — render pages and extract text (for scale and sheet detection)
- **react-konva** (Konva) — drawing layer on top of the PDF for measurements and markups
- **Zustand** — app state
- **Dexie** (IndexedDB) — local project storage
- **pdf-lib** — export marked-up PDF
- **SheetJS (xlsx)** — export quantities to Excel
- **Tailwind CSS** — styling
- **tesseract.js** — OCR for flattened/scanned sheets with no text layer (brought forward by Jordan; reads title-block areas only; engine and English model are served with the app, nothing fetched at runtime)

## Measurement rules (important — accuracy matters)
- PDF units are points: 1 pt = 1/72 inch = 0.352778 mm.
- Store all geometry in **PDF page coordinates** (points), not screen pixels, so zoom never affects measurements.
- Each page has a scale: `realMmPerPdfPt`. For a drawing at 1:100 printed at its intended sheet size: `0.352778 × 100`.
- **Scale detection** reads the text layer for patterns like `1:100`, `SCALE 1:50`, `1:100 @ A1`, `1:200 @ A3`.
  - If the scale says `@ A1` but the PDF page is A3 (the sheet has been resized), **don't adjust or guess**: show no suggested scale, flag "Sheet has been resized", and prompt the user to calibrate from a dimension line on the plan. (Decided by Jordan.) Manually picked scales always mean "as printed on this page".
  - If multiple scales appear on one sheet (several viewports), flag it and let the user choose, or set a scale per region.
  - **Scale areas** (built, on branch `takeoff-improvements`; an advanced feature switched on in Settings → "Different scales on one page"): the user boxes part of a sheet ("+ Scale area" in the scale bar) and gives it a ratio or calibrates inside it. Shapes inside a box use its scale (the smallest box wins where boxes overlap); everything else uses the sheet's. **A shape crossing a box edge is refused** with an explanation (decided by Jordan); an existing shape that ends up crossing a box has no scale and is left out of totals. Calibrating inside an existing box recalibrates that box. Scale areas are saved with the project.
  - Detected scale is a **suggestion**. Show it clearly as "Detected — please verify".
- **Calibrate tool**: user clicks two points on a known dimension and types the real length. This always overrides detection.
- Show a warning badge on any sheet with no confirmed scale.
- **Takeoffs on unscaled sheets are allowed but marked clearly** (decided by Jordan): shapes can be drawn, show "No scale", and are **left out of totals** until the sheet has a scale. Quantities always recompute from the sheet's current scale.
- **Unverified (detected) scales**: takeoffs count in totals but are flagged "unverified scale" until the sheet is confirmed or calibrated (decided by Jordan).
- Display units: mm, m, m² (Australian metric). Round sensibly (lengths 2 dp in m, areas 2 dp in m²).
- Write unit tests for the scale maths and the area/length calculations.

## Sheet labelling
- Extract the sheet number (e.g. `A-101`, `DA02`, `S-200`) and title from text, focusing on the bottom-right title block area first.
- Show a sheet list in a sidebar with thumbnails, number, title, and scale status.
- Users can edit any label. Edits are saved.
- **Title-block areas** (added by Jordan): when names aren't found, the user boxes the sheet number, title and scale on one sheet; the app reads the same spot (as a fraction of the page) on every sheet — text layer if present, otherwise OCR of just that box. Never overwrites hand-edited labels or confirmed scales; scales read this way are still "Detected — please verify" and the resize rule applies. Areas are saved with the project and applied to PDFs added later.

## Takeoff features
- Tools: **Linear** (polyline), **Area** (polygon, with optional cut-outs/deductions), **Perimeter**, **Count** (click markers).
- Drawing styles (added by Jordan): Area and Perimeter can be drawn as **Polygon, Rectangle or Freehand**; Linear as **Lines or Freehand**. Freehand strokes are simplified with a tight tolerance so quantities stay within 0.5%.
- Quantities are grouped by **Item** (e.g. "Internal wall – plasterboard", "Floor tiles"), with a name, colour, unit, and optional trade/category.
- **One item per sheet** (added by Jordan, on branch `takeoff-improvements` until approved): drawing an item on another sheet starts that sheet's own item (same name, colour, type, trade) in the same **group**; the panel shows each sheet's quantity and the group total, with "Combine into one item". A project setting "New item for each sheet" (default on) turns this off. Name/colour/trade edits apply to the whole group.
- **Opening PDFs into a project that already has plans asks first**: "Add to this project" or "Start a new project".
- **Snap** (added by Jordan, on branch `takeoff-improvements`): while calibrating, measuring, drawing takeoffs (not freehand), cut-outs and shape markups, clicks snap to the drawing's line ends, intersections, midpoints or the nearest line, and to existing shapes' edges. Vector PDFs use the real linework read from the PDF (exact); flattened (image) PDFs snap to horizontal/vertical line junctions found in rendered image tiles, shown as **approximate** (orange dashed marker). On by default; **S** or the header button toggles it; **Alt** or **Shift** draws without snapping. A personal preference saved in the browser.
- **Dimensions** (added by Jordan, on branch `takeoff-improvements`): segment lengths for the Measure tool, Linear runs and area/perimeter edges, either **on the line** (bold figure in a solid box) or **beside the line** Revit-style (parallel dimension line, extension lines, 45° ticks, figure outside; rooms dimension on the outside; per-shape "Flip dimension side"). Settings (header → Settings, saved per browser): show on selected shape / all shapes / off; m or mm; normal or large text. Vertical figures read bottom to top. Segments too short to read aren't labelled. Exported PDFs include dimensions at paper sizes (option in the Export dialog).
- Running totals per item, per sheet, and for the whole project.
- Select, move, edit vertices, delete, undo/redo.
- Export: CSV and Excel (item, sheet, quantity, unit).

## Markup features
- Revision cloud, rectangle, ellipse, arrow, line, freehand, text box, highlight.
- Colour and line weight picker.
- Layers: Takeoff and Markup can be shown or hidden separately.
- Export a flattened marked-up PDF with pdf-lib (built with Phase 6). Options: **This page / Marked-up pages only / Whole document** (decided by Jordan). The export shows the visible layers — markups and/or takeoff shapes, optionally with item names and quantities; a "marked-up page" is any page with something drawn on it. Pages from several PDFs combine into one file; original drawings are copied unchanged (vector), shapes are drawn into the page.

## Compare revisions
- (Added by Jordan, on branch `takeoff-improvements`; an advanced feature switched on in Settings → "Compare revisions", which adds **Compare** to the header.) The user says whether this project is the new or old version, then opens the other version's PDF(s) — opened only for comparing, never added to the project or uploaded.
- Sheets pair up by sheet number (then page order), with dropdowns to fix any pairing.
- Each pair is rendered to the same size (2000 px on the long side), lined up automatically if one version sits slightly differently on its page, and compared ink-for-ink with a 1 px tolerance. Changed ink is grouped into numbered boxes: **blue = added** in the new version, **orange = removed** from the old one.
- Views: **Slider** (drag between old and new) and **Overlay** (unchanged grey, added blue, removed orange); "Highlight changes" boxes on either; click a change in the list to zoom to it; wheel zoom and drag pan.
- **Add changes as clouds** puts a red revision cloud round each change on this project's sheet (normal markups, undoable).
- **Sheet versions** (added by Jordan, on branch `takeoff-improvements`): after "Add to this project", once the new sheets' numbers are read, any whose drawing number matches exactly one current sheet (and appears once in the new set) are offered as **new versions** — tick which, then "Keep as separate sheets", "Mark as new versions" or "Mark and compare changes". The new version takes the old one's place in the sheet list with a **"v2 · New version"** badge ("N new versions" in the panel header); earlier versions fold underneath ("superseded"), with "Compare with v1" and "Not a new version? Separate them". Viewing an old version shows a banner with "Open v2". **Takeoffs and markups stay on the version they were drawn on** and still count; the items panel labels them "(v1, old version)". Nothing is moved or re-scaled automatically. Stored as `supersedes` (new sheet id → old), saved in the project as `versions`. Logic in `src/lib/versions.ts` (tested).
- Test files: `scripts/make-revision-test-plans.py` → `test-plans/revision-A.pdf` / `revision-B.pdf` (expected: A-101 four changes, A-102 one).

## UI layout
- Left: sheet list (thumbnails + labels + scale status).
- Centre: plan viewer with smooth zoom and pan (mouse wheel and trackpad).
- Top: tool bar (Select, Pan, Calibrate, Linear, Area, Count, Markup tools).
- Right: Items/quantities panel.
- Keyboard shortcuts: Esc cancels, Enter finishes a shape, Ctrl+Z / Ctrl+Y undo/redo, Space+drag pans.
- **Collapsible panels** (added by Jordan): the sheet list, items panel and scale bar each collapse (‹ › ˄), leaving a thin labelled strip to reopen them. **Focus** (button top-right of the plan, or **F**) hides all three and slims the header to one row; pressing again restores the previous layout. **Full screen** uses the browser's full-screen mode. The plan stays centred as panels change; the scale shows in the bottom info bar while the scale bar is hidden. Panel choices are remembered in the browser (not in the project).

## Build plan (do one phase at a time)
1. **Setup + viewer**: scaffold the project, load PDFs, render pages, zoom/pan, sheet thumbnails.
2. **Scale**: calibrate tool first, then automatic scale detection from text, with "verify" status.
3. **Sheet labelling**: auto-detect sheet number/title, editable sheet list.
4. **Takeoff**: linear, area, count with items and a totals panel. Unit tests for the maths.
5. **Save/load**: IndexedDB autosave, project export/import (.json).
6. **Markup**: markup tools + markup layer, takeoff drawing styles, and the marked-up PDF export.
7. **Exports**: CSV/Excel quantities.
8. **Deploy**: Cloudflare Pages from the GitHub repo.
9. **Nice-to-haves**: print-ready quantity report, whole-page OCR. (Title-block OCR for flattened sets was done after Phase 3; compare revisions was built on `takeoff-improvements`.)

## Branding (done — Cyclo design system)
- Branded to the **Cyclo design system** on claude.ai: https://claude.ai/artifact/G2hkn8FLdfLgG4M7tJ1n7s (read its `project/README.md` and `project/tokens.json`). Keep new UI consistent with it.
- **Where it lives:** colours are Tailwind theme tokens in `src/index.css` (`graphite`, `chalk`, `sandstone`, `signal-orange`, `steel-blue` and tints; semantic `accent`, `accent-hover`, `accent-text`). The `neutral-*` palette is remapped to Cyclo's warm neutrals, so use `neutral-*` for greys. Logos are in `src/assets/brand/` (copied unchanged — never redraw or recolour); the favicon is the Cyclo icon.
- **Rules in use:** Graphite header with the chalk wordmark; White/Chalk panels with Graphite text; Signal Orange only for the primary button, active tool and selection, always with **Graphite text on orange** (white on orange fails contrast); readable orange text uses `accent-text` (#832C15); warnings use the orange family, "confirmed" uses steel blue, real errors stay red; section labels are sentence case with the small orange square (`.section-label`); flat colour, no shadows; no emoji (no ⚠).
- **Derived (not in the guide):** neutral-400…700 are darker warm greys made from Foundation Grey so small text passes 4.5:1. Foundation Grey itself fails as small text on white — don't use it for body or small text on light grounds.
- **Font:** **Arial** (the guide's approved fallback) until the ABC Diatype web licence is confirmed; then add the font files and change `--font-sans`.
- Takeoff item colours and markup colours are a separate, distinguishable set, not brand colours.

## Hosting
- Code lives in a **private GitHub repo**.
- **Live at https://cyclomeasure.space** (custom domain, bought through Cloudflare; also reachable at https://planmeasure.jordan-hyslop97.workers.dev). Deployed on Cloudflare as a Worker serving static assets, connected to the repo; every push to `main` redeploys (build command `npm run build`, output folder `dist`). Staff should use **cyclomeasure.space only** — projects are saved per web address, so work done at the workers.dev address won't appear there.
- Protected with **Cloudflare Access** (Zero Trust team `cyclo-group`): only `@cyclogroup.com.au` emails can open it, signing in with an emailed one-time PIN (no Cloudflare or GitHub account needed); 7-day sessions. Any new address must be added to the Access policy before staff use it.
- Deploy settings are in the repo: `.node-version` (22), `public/_headers` (Content-Security-Policy: the site only loads its own files and sends data nowhere; caching). If a new feature needs to load anything from another site, the CSP must be updated — keep everything self-hosted instead where possible.
- Phase 7 (CSV/Excel quantities) was skipped by Jordan — not needed for now.

## Testing
- Keep a `test-plans/` folder (git-ignored) with real sample PDFs for manual testing.
- Before finishing any phase, check: a known dimension on a test plan measures correctly within 0.5%.
