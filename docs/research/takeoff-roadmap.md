# Takeoff and measuring: how CycloMeasure compares, and what to build next

*Prepared overnight, November 2026.*

**Important:** the planned web research couldn't run, because this workspace's network blocks the vendors' websites (exactal.com, buildsoft.com.au, planswift.com, oncenter.com). The comparison below comes from Claude's general knowledge of these products. It hasn't been checked against their current websites, so treat specific feature claims as "likely, to be confirmed". Allowing those sites in the environment's network settings would let it be verified.

## 1. What the leading tools do (general knowledge, unverified)

**Exactal CostX** (Australian; quantity surveyors)
- Takeoff is organised into **dimension groups** (area, length, count, points), arranged in folders, measured on drawings from a **drawing register**.
- Quantities **link live into workbooks** (estimating spreadsheets with rates). Change a measurement and the cost updates.
- **Revisions:** compare two versions of a drawing (overlay, highlighting changes) and carry measurements across.
- **Snapping** to the drawing's linework on vector PDFs and CAD. **3D/BIM model takeoff.**
- Measurements can carry **height or depth**, to turn lengths into wall areas and areas into volumes.

**Buildsoft Cubit / Cubit Select** (Australian; builders and estimators)
- **Measurement types:** area, linear, count, plus **walls with height**, **pitched roofs (slope)**, volumes, and **deductions** (e.g. openings out of a wall area).
- **Templates / assemblies:** one takeoff produces several quantities, e.g. a wall run gives plasterboard m², studs, insulation and paint.
- **Auto count** (find repeated symbols), copying takeoff between drawings, and **revision overlays**.
- An estimate is built directly from the takeoff (rates, labour, margins, quotes).

**PlanSwift and On-Screen Takeoff** (international)
- **Conditions or items** with height and attributes; **assemblies** of parts.
- **Typical areas:** measure once and repeat ×N (e.g. identical floors or units).
- **Bid areas / zones** (by level, stage or building), **overlay comparison** of revisions, **auto count**, and export to Excel.

## 2. Where CycloMeasure is now

**Has:**
- Linear, area (with cut-outs), perimeter and count, drawn as polygons, rectangles or freehand.
- Items with trade and colour, with totals per sheet and project. New on this branch: one item per sheet, grouped.
- Per-sheet scales with verification and calibration, and automatic sheet names and scales (including OCR).
- Markups, marked-up PDF export, autosave and project files.

**Missing, compared with the above:** snapping, height/depth (wall areas, volumes), assemblies and templates, multipliers and wastage, revision comparison, auto count, arcs, zones, and Excel export.

## 3. Recommended roadmap

Ranked by value to Cyclo's estimating, against effort. All of these fit the app's "everything stays in the browser" approach.

### Tier 1: biggest wins, reasonable effort
1. **Snap to the drawing.** Clicks lock onto line ends, corners, midpoints and intersections in vector PDFs. It's the biggest accuracy and speed gain, and what users of CostX and Cubit expect. *Medium effort* (read the PDF's linework with pdf.js).
2. **Height and depth on items:**
   - Linear × height = **wall area**, with an optional "both sides" ×2.
   - Area × depth = **volume** (slabs, fill).
   - Deduct openings (doors and windows) from wall areas.

   *Small–medium effort.*
3. **Multiplier and wastage per item:** e.g. "Typical floor ×3", "+10% waste", shown separately from the measured quantity. *Small.*
4. **Item library / templates:** a saved company list of items (name, trade, unit, colour, height, waste) to start each project from, instead of retyping. *Small–medium.*
5. **Quantity labels on the plan, and a legend on exported PDFs:** a toggle to show item name and quantity on each shape, plus a summary table on the exported pages. *Small.*
6. **Copy and paste shapes between sheets,** in the same position, for repeated floors and typical units. *Small.*
7. **Excel export** (the skipped Phase 7). Worth revisiting once quantities feed estimates. *Small.*

### Tier 2: advanced
8. **Assemblies / formulas:** one wall run produces plasterboard m², studs (at 600 centres), insulation and paint litres. *Medium.*
9. **Revision compare:** overlay two versions of a sheet, highlight what changed, and carry measurements over. *Medium–large.*
10. **Auto count:** click one symbol (a light or power point) and find the rest on the sheet. *Large* (image matching in the browser).
11. **Click-inside-a-room area fill:** click inside a room and the app traces its boundary. *Large.*
12. **Zones / levels:** split totals by level, stage or building. *Medium.*
13. **Arcs and curved walls; roof pitch** (plan area → true roof area). *Medium.*

Out of scope for now: 3D/BIM model takeoff, and full estimating (rates, labour, quotes). Those are what CostX and Cubit charge for, and they'd need a different kind of app.

## 4. More "prompting" improvements (like the two built tonight)
- **Unfinished shape when changing sheets:** today it's silently dropped. Ask "Finish or discard this shape?" instead.
- **Drawing on a sheet with no scale:** on the first shape, ask "This sheet has no scale. Calibrate now?", rather than only showing the warning in the hint.
- **New items named automatically** ("Area 1"): ask for a name on the first shape, with the item library as suggestions.
- **Exporting with unverified scales:** warn "3 sheets have unverified scales; quantities on them may be wrong", with a link to them.
- **After a detected scale's first measurement:** nudge "Does this match a dimension on the plan? Confirm the scale".
- **First-time tips:** a short three-step guide on first use (open plans → check scale → measure).

## 5. Built tonight (branch `takeoff-improvements`, not live)
- **One item per sheet, totals added together:**
  - Drawing an item on another sheet starts that sheet's own item in the same group.
  - The panel shows each sheet's quantity and the total, and you can click a sheet row to jump to it.
  - "Combine into one item" is available, and the "New item for each sheet" switch turns it off.
- **"Add to this project, or start a new one?"** when opening PDFs into a project that already has plans.
