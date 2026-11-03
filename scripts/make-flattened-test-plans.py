"""Makes test-plans/flattened-tests.pdf: label-tests.pdf with every page turned
into a picture (no text layer), like plans published by council DA portals.
Needs pdftoppm (poppler) and Pillow. Run make-label-test-plans.py first."""
import glob, os, subprocess, tempfile
from PIL import Image

DPI = 200
with tempfile.TemporaryDirectory() as tmp:
    subprocess.run(["pdftoppm", "-r", str(DPI), "-gray", "-jpeg", "test-plans/label-tests.pdf", os.path.join(tmp, "p")], check=True)
    pages = [Image.open(f).convert("RGB") for f in sorted(glob.glob(os.path.join(tmp, "p-*.jpg")))]
    pages[0].save("test-plans/flattened-tests.pdf", save_all=True, append_images=pages[1:], resolution=DPI)
print("Wrote test-plans/flattened-tests.pdf", f"({os.path.getsize('test-plans/flattened-tests.pdf') // 1024} KB)")
