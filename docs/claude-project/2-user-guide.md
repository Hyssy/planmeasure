# CycloMeasure — user guide

## 1. Signing in
1. Go to **https://cyclomeasure.space** in Chrome or Edge.
2. Enter your **@cyclogroup.com.au** email and request a code.
3. Enter the code from your inbox. You'll stay signed in for 7 days.

You don't need a Cloudflare, GitHub or other account.

## 2. Opening plans
- Click **Open PDFs** in the header, or drag PDFs onto the window. You can open several at once.
- Opening PDFs starts a **project**, named after the first file. Rename it from the **Project** menu (top left, next to the logo).
- Sheets appear in the **sheet list** on the left with thumbnails. Click one to view it.
- **Zoom** with the mouse wheel or a trackpad pinch. **Pan** by holding **Space** and dragging, or use the **Pan** tool. **Fit** (bottom right) shows the whole sheet.

## 3. Sheet names
- Sheet numbers and titles are read automatically. Labels read by OCR show **"Read by OCR — please check"**.
- To fix a label, click **Edit** on the sheet in the list.
- **Names not found?** Click **Set title-block areas** at the top of the sheet list, then:
  1. On one sheet, drag a box round the **sheet number**, then the **title**, then the **scale**. The bar at the top shows what each box reads.
  2. Click **Apply to all sheets**, then **Done**.

  Labels you've edited by hand are never overwritten.
- Use the **search box** to find a sheet by number or title.

## 4. Setting the scale (do this before measuring)
The **scale bar** above the plan shows the sheet's scale status:
- **"Detected — please verify":** check it by measuring a known dimension (step 5). If it's right, click **It's correct**.
- **"Several scales":** pick the one for the view you're measuring.
- **"Sheet has been resized":** the drawing was printed at a different size, so use **Calibrate**.
- **"No scale":** use **Calibrate**, or **Set scale…** if you know it.

**Calibrate (C):** click both ends of a dimension you know (zoom in for accuracy), type its real length in mm or m, and click **Set scale**. A long dimension gives the best accuracy.

Shapes on a sheet with **no scale** aren't counted in totals. Shapes on an **unverified** scale are counted, but flagged.

## 5. Measuring
- **Measure (M):** a quick two-click ruler. Nothing is saved.
- **Takeoff tools** save quantities into **items**:
  - **Linear (L):** click along a wall or run, then press **Enter** or double-click to finish.
  - **Area (A):** click the corners, then click the first point again (or press **Enter**) to close.
  - **Perimeter (P):** like Area, but measures the edge length.
  - **Count (N):** click each light, door or fitting.
- **Drawing style:** shown in the bar under the toolbar, or press **1 / 2 / 3**.
  - Area and Perimeter: **Polygon**, **Rectangle** (drag corner to corner) or **Freehand** (hold the button and trace).
  - Linear: **Lines** or **Freehand**.
- While drawing:
  - **Shift** keeps a segment straight.
  - **Backspace** removes the last point.
  - **Esc** cancels.
- **Items panel (right):**
  - **+ Item** creates an item with a name, type, colour and trade. If you just start drawing, an item is created for you; rename it with **Edit**.
  - Click an item to draw more of it.
  - Totals show for the **Whole project** or **This sheet**, with **Show by sheet** for a breakdown.
- **Cut-outs:** select an area, click **+ Add cut-out**, then click round the part to deduct (a void, stair or courtyard). The panel shows gross area, cut-outs and net area.

## 6. Editing and undoing
- **Select (V):** click a shape or markup.
  - Drag a corner handle to reshape it, or drag the shape to move it.
  - **Delete** removes it.
  - For takeoff shapes, the panel shows its quantity and lets you move it to another item.
- **Undo / Redo:** the ↶ ↷ buttons, or **Ctrl+Z / Ctrl+Y**.

## 7. Markups
- **Markup (K)**, then choose a type in the bar under the toolbar: **Cloud, Rectangle, Ellipse, Arrow, Line, Pen, Text, Highlight**. Pick a colour, a line weight and, for text, a size.
  - Drag to draw most shapes.
  - **Pen:** hold the mouse button and draw.
  - **Text:** click, type, then press **Enter**. **Shift+Enter** starts a new line. Double-click text with Select to edit it.
- **Takeoffs / Markups** tick boxes in the header show or hide each layer.

## 8. Exporting a marked-up PDF
1. Click **Export PDF** in the header.
2. Choose **This page**, **Marked-up pages only** or **Whole document**.
3. Tick what to include: markups, takeoff shapes, and item names with quantities.
4. Click **Export PDF**. The file downloads.

## 9. Saving, sharing and backups
- Work **saves automatically**. "Saved" shows next to the project name.
- Saved work lives in **this browser on this computer**, at this web address.
- **Project menu:**
  - **New project:** start a fresh project.
  - **Switch** to another project, or **Delete** one.
  - **Export project…:** saves one file containing the PDFs and all your work.
  - **Import project…:** opens a file someone sent you, or one you exported on another computer.
- Export important projects now and then as a backup. Clearing browser data deletes saved projects.

## 10. More room on screen
- **‹ / ›** collapse the sheet list and items panel. Click the thin strip to reopen one.
- **˄** hides the scale bar. The scale still shows at the bottom of the plan.
- **Focus (F),** top right of the plan: hides everything at once. Press again to restore.
- **Full screen:** also hides the browser's tabs. **Esc** exits.

## Keyboard shortcuts
| Key | Action |
|---|---|
| V | Select |
| H | Pan |
| C | Calibrate |
| M | Measure |
| L | Linear |
| A | Area |
| P | Perimeter |
| N | Count |
| K | Markup |
| 1 / 2 / 3 | Drawing style |
| F | Focus |
| Space + drag | Pan |
| Shift | Straight lines |
| Enter | Finish shape |
| Backspace | Remove last point |
| Esc | Cancel / deselect |
| Delete | Delete selected |
| Ctrl+Z / Ctrl+Y | Undo / redo |

## Troubleshooting
- **Measurements look wrong:** check the scale bar. Verify by measuring a known dimension, or calibrate.
- **Sheets have no names:** use **Set title-block areas**, or **Edit** each sheet.
- **OCR is slow:** scanned sets are read in the background, a few seconds per sheet. Keep working meanwhile.
- **My project isn't there:** projects are saved per browser and per computer. Are you on the same computer and browser, at cyclomeasure.space? Use Export / Import to move projects.
- **"That PDF is already open":** the same file can't be added to a project twice.
- **Can't sign in:** make sure you're using your @cyclogroup.com.au address, and check junk mail for the code.
