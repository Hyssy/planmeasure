"""Generates test-plans/area-tests.pdf (text) and area-tests-flat.pdf (flattened):
four A3 sheets with an unusual title block at the TOP-LEFT, unusual headings
("Reference", "Description", "Plot") and a bare "1:50" — automatic labelling
can't read these, so they test teaching the title-block areas.

Expected: KL-07 Landscape Concept 1:100 / KL-08 Planting Plan North Courtyard 1:100 /
          KL-09 Irrigation Layout 1:100 / KL-10 Details 1:20
"""
import glob, os, subprocess, tempfile
from PIL import Image

def mm(v): return v * 72 / 25.4
def esc(s): return s.replace("\\\\", "\\\\\\\\").replace("(", "\\\\(").replace(")", "\\\\)")

SHEETS = [
    ("KL-07", ["Landscape Concept"], "1:100"),
    ("KL-08", ["Planting Plan", "North Courtyard"], "1:100"),
    ("KL-09", ["Irrigation Layout"], "1:100"),
    ("KL-10", ["Details"], "1:20"),
]

def page(number, title, scale):
    W, H = mm(420), mm(297)
    ops = ["0.8 w"]
    def text(s, x, y, size): ops.append(f"BT /F1 {size} Tf {x:.2f} {H - y:.2f} Td ({esc(s)}) Tj ET")
    def rect(x, y, w, h): ops.append(f"{x:.2f} {H - y - h:.2f} {w:.2f} {h:.2f} re S")
    # title block, top-left
    rect(mm(10), mm(10), mm(120), mm(40))
    text("GREENLEAF LANDSCAPE STUDIO", mm(14), mm(17), 9)
    text("Reference", mm(14), mm(25), 6); text(number, mm(14), mm(32), 13)
    text("Description", mm(50), mm(25), 6)
    for i, line in enumerate(title): text(line, mm(50), mm(32) + i * 12, 11)
    text("Plot", mm(105), mm(25), 6); text(scale, mm(105), mm(32), 11)
    # plan clutter elsewhere, including things that look like numbers
    rect(mm(150), mm(60), mm(240), mm(200))
    for i, tag in enumerate(["T01", "T01", "T02", "T02", "P1", "P2", "G3"]): text(tag, mm(170) + i * mm(25), mm(120), 9)
    text("FALL 1:100", mm(200), mm(200), 8)
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
write("test-plans/area-tests.pdf", [page(*s) for s in SHEETS])
with tempfile.TemporaryDirectory() as tmp:
    subprocess.run(["pdftoppm", "-r", "200", "-gray", "-jpeg", "test-plans/area-tests.pdf", os.path.join(tmp, "p")], check=True)
    ims = [Image.open(f).convert("RGB") for f in sorted(glob.glob(os.path.join(tmp, "p-*.jpg")))]
    ims[0].save("test-plans/area-tests-flat.pdf", save_all=True, append_images=ims[1:], resolution=200)
print("Wrote test-plans/area-tests.pdf and area-tests-flat.pdf")
