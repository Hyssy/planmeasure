"""Generates sheet-labelling test PDFs in test-plans/:

  label-tests.pdf            six pages, each with a different title-block style
  A-501 Door Schedule.pdf    a one-sheet file with no title block (name only)

Expected labels are listed in EXPECTED below.
"""
import os

def mm(v):
    return v * 72 / 25.4

def esc(s):
    return s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")

class Page:
    def __init__(self, w_mm, h_mm, rotate=0):
        # displayed size
        self.dw, self.dh = mm(w_mm), mm(h_mm)
        self.rotate = rotate
        self.ops = ["0.8 w"]

    def _user(self, dx, dy):
        # display (from top-left) -> PDF user space
        if self.rotate == 90:
            return dy, dx
        return dx, self.dh - dy

    def text(self, s, dx, dy, size=8):
        ux, uy = self._user(dx, dy)
        tm = "0 1 -1 0" if self.rotate == 90 else "1 0 0 1"
        self.ops.append(f"BT /F1 {size} Tf {tm} {ux:.2f} {uy:.2f} Tm ({esc(s)}) Tj ET")

    def line(self, x1, y1, x2, y2):
        a, b = self._user(x1, y1), self._user(x2, y2)
        self.ops.append(f"{a[0]:.2f} {a[1]:.2f} m {b[0]:.2f} {b[1]:.2f} l S")

    def rect(self, x, y, w, h):
        self.line(x, y, x + w, y); self.line(x + w, y, x + w, y + h)
        self.line(x + w, y + h, x, y + h); self.line(x, y + h, x, y)

    def plan_clutter(self):
        # a floor plan with door/window tags and grid labels
        self.rect(mm(40), mm(40), self.dw * 0.55, self.dh * 0.6)
        for i, tag in enumerate(["D01", "D01", "D02", "D02", "D03", "W01", "W01", "W02", "W02"]):
            self.text(tag, mm(60) + i * mm(35), mm(80) + (i % 3) * mm(40), 9)
        for i, g in enumerate("ABCD"):
            self.text(g, mm(40) + i * mm(80), mm(30), 14)
        for i in range(1, 4):
            self.text(str(i), mm(25), mm(40) + i * mm(70), 14)

    def media(self):
        if self.rotate == 90:
            return self.dh, self.dw  # user-space width/height (portrait box, shown landscape)
        return self.dw, self.dh

def title_block_below(p, number, title, scale):
    x, y = p.dw - mm(180), p.dh - mm(70)
    p.rect(x, y, mm(170), mm(60))
    p.text("PROJECT", x + 8, y + 14, 6); p.text("NEW VETERINARY CLINIC", x + 8, y + 28, 11)
    p.text("DRAWING TITLE", x + 8, y + 50, 6); p.text(title, x + 8, y + 66, 14)
    p.text("DRAWING NO.", x + 8, y + 110, 6); p.text(number, x + 8, y + 134, 22)
    p.text("SCALE", x + mm(70), y + 110, 6); p.text(scale, x + mm(70), y + 128, 10)
    p.text("REV", x + mm(130), y + 110, 6); p.text("C", x + mm(130), y + 134, 22)
    p.text("NOT FOR CONSTRUCTION", x + 8, y + 160, 8)

pages = []

# 1. A1, labelled fields with values below
p = Page(841, 594); p.plan_clutter()
p.text("GROUND FLOOR PLAN", mm(60), p.dh - mm(130), 16); p.text("SCALE 1:100", mm(60), p.dh - mm(124), 9)
title_block_below(p, "A-101", "GROUND FLOOR PLAN", "1:100 @ A1")
pages.append(p)

# 2. A3, labels with values on the same line; sheet number split into two text pieces
p = Page(420, 297); p.plan_clutter()
x, y = p.dw - mm(110), p.dh - mm(40)
p.text("TITLE: FOOTING DETAILS", x, y, 9)
p.text("DWG No:", x, y + 16, 9); p.text("S-", x + 40, y + 16, 16); p.text("200", x + 40 + 16, y + 16, 16)
p.text("SHEET 3 OF 12", x, y + 34, 7)
pages.append(p)

# 3. A1 drawn on a portrait page and rotated for display (common in CAD exports)
p = Page(841, 594, rotate=90); p.plan_clutter()
title_block_below(p, "A-201", "ELEVATIONS", "1:100 @ A1")
pages.append(p)

# 4. A3, unlabelled title block: big number and title only
p = Page(420, 297); p.plan_clutter()
x, y = p.dw - mm(120), p.dh - mm(40)
p.text("12 SMITH STREET, NEWCASTLE NSW 2300", x, y, 7)
p.text("SITE ANALYSIS", x, y + 22, 16)
p.text("DA02", x + mm(80), y + 50, 26)
p.text("12/03/2026", x, y + 50, 7)
pages.append(p)

# 5. A1 cover sheet with a drawing list table
p = Page(841, 594)
p.text("DRAWING LIST", mm(40), mm(50), 14)
p.text("SHEET", mm(40), mm(62), 8); p.text("TITLE", mm(80), mm(62), 8)
for i, (n, t) in enumerate([("A-000", "COVER SHEET"), ("A-101", "GROUND FLOOR PLAN"), ("A-201", "ELEVATIONS"), ("S-200", "FOOTING DETAILS"), ("DA02", "SITE ANALYSIS")]):
    p.text(n, mm(40), mm(70) + i * mm(6), 9); p.text(t, mm(80), mm(70) + i * mm(6), 9)
title_block_below(p, "A-000", "COVER SHEET", "NTS")
pages.append(p)

# 7. A1 with a DA-style title block: small underlined headings ending in ":"
p = Page(841, 594); p.plan_clutter()
for (txt, x, y, size) in [
    ("AMENDMENTS", 1500, 1555, 5), ("Project Title:", 1620, 1575, 13), ("Proposed Child Care", 1620, 1600, 13), ("Centre", 1620, 1620, 13),
    ("DRAWING TITLE:", 1830, 1560, 5), ("Acoustic Barrier Details", 1830, 1580, 9),
    ("ADDRESS:", 1830, 1638, 5), ("1 Kitty Lane, Cobbitty", 1830, 1655, 9),
    ("CLIENT DETAILS:", 2010, 1560, 5), ("Cobbitty Childcare Holdings Pty Ltd", 2010, 1578, 9),
    ("LOCAL GOVERNMENT AREA:", 2010, 1615, 5), ("Camden Council", 2012, 1630, 9),
    ("Issue For:", 2050, 1645, 5), ("DA", 2050, 1652, 5), ("Issue:", 2125, 1645, 5), ("A", 2125, 1652, 5),
    ("Date:", 2010, 1670, 5), ("11.5.2026", 2010, 1677, 5), ("Scale:", 2075, 1670, 5), ("1:100", 2075, 1677, 5),
    ("Drawing #:", 2130, 1670, 5), ("A011", 2130, 1677, 5), ("Project #:", 2205, 1670, 5), ("10396", 2205, 1677, 5),
]:
    p.text(txt, x, y, size)
    if txt.endswith(":") and size == 5:
        p.line(x, y + 1.2, x + len(txt) * 2.9, y + 1.2)  # underline
p.line(1480, 1545, 2370, 1545)
pages.insert(5, p)

# 6. A3 with no text at all (e.g. a scanned or flattened sheet)
p = Page(420, 297); p.rect(mm(40), mm(40), mm(200), mm(150))
pages.append(p)

def write_pdf(path, pages):
    objs = []
    def add(b):
        objs.append(b); return len(objs)
    font = add(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    conts = []
    for pg in pages:
        c = "\n".join(pg.ops).encode()
        conts.append((add(b"<< /Length %d >>\nstream\n" % len(c) + c + b"\nendstream"), pg))
    pages_id = len(objs) + len(pages) + 1
    kids = []
    for cid, pg in conts:
        w, h = pg.media()
        rot = f" /Rotate {pg.rotate}" if pg.rotate else ""
        kids.append(add(f"<< /Type /Page /Parent {pages_id} 0 R /MediaBox [0 0 {w:.2f} {h:.2f}]{rot} /Contents {cid} 0 R /Resources << /Font << /F1 {font} 0 R >> >> >>".encode()))
    add(("<< /Type /Pages /Kids [" + " ".join(f"{k} 0 R" for k in kids) + f"] /Count {len(kids)} >>").encode())
    cat = add(f"<< /Type /Catalog /Pages {pages_id} 0 R >>".encode())
    out = bytearray(b"%PDF-1.4\n"); offs = []
    for i, o in enumerate(objs, 1):
        offs.append(len(out)); out += f"{i} 0 obj\n".encode() + o + b"\nendobj\n"
    x = len(out)
    out += f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n".encode()
    out += b"".join(f"{o:010d} 00000 n \n".encode() for o in offs)
    out += f"trailer\n<< /Size {len(objs) + 1} /Root {cat} 0 R >>\nstartxref\n{x}\n%%EOF\n".encode()
    open(path, "wb").write(out)

os.makedirs("test-plans", exist_ok=True)
write_pdf("test-plans/label-tests.pdf", pages)
q = Page(420, 297); q.rect(mm(40), mm(40), mm(300), mm(150)); q.text("D01", mm(60), mm(60), 9)
write_pdf("test-plans/A-501 Door Schedule.pdf", [q])
print("Wrote test-plans/label-tests.pdf and test-plans/A-501 Door Schedule.pdf")

EXPECTED = [
    ("A-101", "GROUND FLOOR PLAN"), ("S-200", "FOOTING DETAILS"), ("A-201", "ELEVATIONS"),
    ("DA02", "SITE ANALYSIS"), ("A-000", "COVER SHEET"), ("A011", "Acoustic Barrier Details"), ("", ""),
    ("A-501", "Door Schedule"),
]
