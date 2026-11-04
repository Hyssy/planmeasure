"""Generates test-plans/revision-A.pdf and revision-B.pdf: two A3 sheets
(A-101 Ground Floor Plan, A-102 First Floor Plan) for testing Compare revisions.

Rev B puts the sheets in the OPPOSITE page order (pairing must use sheet numbers)
and everything on Rev B is nudged 2 mm right and 1.5 mm down (alignment test).

Expected changes:
  A-101: a new partition wall added (blue), the WC door removed (orange),
         the revision letter in the title block changed A -> B.
  A-102: only the revision letter changed.
"""
import os

def mm(v): return v * 72 / 25.4
def esc(s): return s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")

def page(number, title, rev, changes, nudge):
    W, H = mm(420), mm(297)
    dx, dy = nudge
    ops = []
    def line(x0, y0, x1, y1, w=1.4): ops.append(f"{w} w {mm(x0+dx):.2f} {H-mm(y0+dy):.2f} m {mm(x1+dx):.2f} {H-mm(y1+dy):.2f} l S")
    def rect(x, y, w, h, lw=0.8): ops.append(f"{lw} w {mm(x+dx):.2f} {H-mm(y+h+dy):.2f} {mm(w):.2f} {mm(h):.2f} re S")
    def text(s, x, y, size): ops.append(f"BT /F1 {size} Tf {mm(x+dx):.2f} {H-mm(y+dy):.2f} Td ({esc(s)}) Tj ET")
    # border and title block, bottom right
    rect(10, 10, 400, 277)
    rect(300, 240, 110, 47)
    text("CYCLO TEST BUILDING", 304, 248, 9)
    text("DRAWING NO.", 304, 258, 6); text(number, 304, 266, 14)
    text("DRAWING TITLE", 340, 258, 6); text(title, 340, 266, 10)
    text("SCALE", 304, 276, 6); text("1:100", 304, 283, 10)
    text("REV", 380, 276, 6); text(rev, 380, 283, 10)
    # building outline 20 m x 12 m at 1:100 = 200 x 120 mm
    rect(40, 40, 200, 120, 2)
    line(140, 40, 140, 160)            # central wall
    line(40, 100, 140, 100)            # wall
    text("LIVING", 80, 75, 10); text("BED 1", 180, 75, 10); text("KITCHEN", 75, 135, 10)
    if "partition" in changes:
        line(190, 100, 240, 100)       # new partition wall
        text("STORE", 205, 125, 10)
    if "door" not in changes:
        # WC door: swing arc approximated by a polyline
        import math
        pts = [(140 + 9 * math.cos(math.radians(a)), 120 + 9 * math.sin(math.radians(a))) for a in range(0, 91, 10)]
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]): line(x0, y0, x1, y1, 0.5)
        line(140, 120, 149, 120, 0.5)
    return W, H, "\n".join(ops).encode()

def write(path, pages):
    objs = []
    def add(b): objs.append(b); return len(objs)
    font = add(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    conts = [(add(b"<< /Length %d >>\nstream\n" % len(c) + c + b"\nendstream"), w, h) for w, h, c in pages]
    pid = len(objs) + len(pages) + 1
    kids = [add(f"<< /Type /Page /Parent {pid} 0 R /MediaBox [0 0 {w:.2f} {h:.2f}] /Contents {c} 0 R /Resources << /Font << /F1 {font} 0 R >> >> >>".encode()) for c, w, h in conts]
    add(("<< /Type /Pages /Kids [" + " ".join(f"{k} 0 R" for k in kids) + f"] /Count {len(kids)} >>").encode())
    cat = add(f"<< /Type /Catalog /Pages {pid} 0 R >>".encode())
    out = bytearray(b"%PDF-1.4\n"); offs = []
    for i, o in enumerate(objs, 1):
        offs.append(len(out)); out += f"{i} 0 obj\n".encode() + o + b"\nendobj\n"
    x = len(out)
    out += f"xref\n0 {len(objs)+1}\n0000000000 65535 f \n".encode() + b"".join(f"{o:010d} 00000 n \n".encode() for o in offs)
    out += f"trailer\n<< /Size {len(objs)+1} /Root {cat} 0 R >>\nstartxref\n{x}\n%%EOF\n".encode()
    open(path, "wb").write(out)

os.makedirs("test-plans", exist_ok=True)
write("test-plans/revision-A.pdf", [
    page("A-101", "GROUND FLOOR PLAN", "A", [], (0, 0)),
    page("A-102", "FIRST FLOOR PLAN", "A", ["door"], (0, 0)),
])
write("test-plans/revision-B.pdf", [
    page("A-102", "FIRST FLOOR PLAN", "B", ["door"], (2, 1.5)),
    page("A-101", "GROUND FLOOR PLAN", "B", ["partition", "door"], (2, 1.5)),
])
print("Wrote test-plans/revision-A.pdf and revision-B.pdf")
