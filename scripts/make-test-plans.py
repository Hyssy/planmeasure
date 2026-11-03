"""Generates test-plans/scale-tests.pdf: one page per scale situation.

Every page has a grid whose squares are exactly 10 m x 10 m in real life,
so measuring one square should read 10.00 m.
"""
import os

def mm(v):
    return v * 72 / 25.4

def page(w_mm, h_mm, grid_mm, texts):
    w, h = mm(w_mm), mm(h_mm)
    s = ["0.8 w"]
    x0, y0 = mm(40), mm(40)
    nx = int((w_mm - 80) // grid_mm)
    ny = int((h_mm - 80) // grid_mm)
    for i in range(nx + 1):
        x = x0 + mm(grid_mm * i)
        s.append(f"{x:.3f} {y0:.3f} m {x:.3f} {y0 + mm(grid_mm * ny):.3f} l S")
    for j in range(ny + 1):
        y = y0 + mm(grid_mm * j)
        s.append(f"{x0:.3f} {y:.3f} m {x0 + mm(grid_mm * nx):.3f} {y:.3f} l S")
    s.append(f"BT /F1 9 Tf {x0 + 4:.2f} {y0 + mm(grid_mm) + 4:.2f} Td (each square = 10 m) Tj ET")
    for i, t in enumerate(texts):
        s.append(f"BT /F1 14 Tf {w - mm(200):.2f} {mm(25) - i * 16:.2f} Td ({t}) Tj ET")
    return w, h, "\n".join(s).encode()

pages = [
    # A1 drawing at 1:100: 10 m = 100 mm on paper
    page(841, 594, 100, ["A-101 GROUND FLOOR PLAN", "SCALE 1:100 @ A1"]),
    # A1 drawing at 1:100 printed on A3 (half size): 10 m = 50 mm
    page(420, 297, 50, ["A-101 GROUND FLOOR PLAN (A3 PRINT)", "SCALE 1:100 @ A1"]),
    # Two viewports at different scales
    page(841, 594, 100, ["A-501 PLAN AND DETAILS", "PLAN SCALE 1:100   DETAIL SCALE 1:20"]),
    # Scale text with a fall note that must be ignored: 1:200 -> 10 m = 50 mm
    page(420, 297, 50, ["C-100 SITE PLAN 1:200", "FALL 1:100 TO GRATE"]),
    # No scale at all: 10 m = 80 mm (only calibration can work)
    page(594, 420, 80, ["SK-01 SKETCH", "NOT TO SCALE"]),
]

objs = []
def add(b):
    objs.append(b)
    return len(objs)

font = add(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
contents = []
for w, h, c in pages:
    cid = add(b"<< /Length %d >>\nstream\n" % len(c) + c + b"\nendstream")
    contents.append((cid, w, h))
pages_id = len(objs) + len(pages) + 1
kids = [add(f"<< /Type /Page /Parent {pages_id} 0 R /MediaBox [0 0 {w:.3f} {h:.3f}] /Contents {cid} 0 R /Resources << /Font << /F1 {font} 0 R >> >> >>".encode()) for cid, w, h in contents]
add(("<< /Type /Pages /Kids [" + " ".join(f"{k} 0 R" for k in kids) + f"] /Count {len(kids)} >>").encode())
cat = add(f"<< /Type /Catalog /Pages {pages_id} 0 R >>".encode())
out = bytearray(b"%PDF-1.4\n")
offs = []
for i, o in enumerate(objs, 1):
    offs.append(len(out))
    out += f"{i} 0 obj\n".encode() + o + b"\nendobj\n"
x = len(out)
out += f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n".encode()
out += b"".join(f"{o:010d} 00000 n \n".encode() for o in offs)
out += f"trailer\n<< /Size {len(objs) + 1} /Root {cat} 0 R >>\nstartxref\n{x}\n%%EOF\n".encode()
os.makedirs("test-plans", exist_ok=True)
open("test-plans/scale-tests.pdf", "wb").write(out)
print("Wrote test-plans/scale-tests.pdf")
