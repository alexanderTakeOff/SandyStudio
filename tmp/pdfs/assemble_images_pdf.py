from io import BytesIO
from pathlib import Path

from PIL import Image
from reportlab.pdfgen import canvas


SOURCES = [
    Path(r"C:\Users\NAVIA VISION ONE\Pictures\Screenshots\Снимок экрана 2026-08-03 122028.png"),
    Path(r"C:\Users\NAVIA VISION ONE\Pictures\Screenshots\Снимок экрана 2026-08-03 122046.png"),
    Path(r"C:\Users\NAVIA VISION ONE\Pictures\Screenshots\Снимок экрана 2026-08-03 122057.png"),
    Path(r"C:\Users\NAVIA VISION ONE\Pictures\Screenshots\Снимок экрана 2026-08-03 122109.png"),
    Path(r"C:\Users\NAVIA VISION ONE\Pictures\Screenshots\Снимок экрана 2026-08-03 122122.png"),
    Path(r"C:\Users\NAVIA VISION ONE\Pictures\Screenshots\Снимок экрана 2026-08-03 122136.png"),
]
OUTPUT = Path(r"C:\SandyStudio\output\pdf\Соглашение_страницы_1-6.pdf")
MAX_BYTES = 15 * 1024 * 1024
POINTS_PER_INCH = 72
RENDER_DPI = 150


def compress(image: Image.Image) -> BytesIO:
    rgb = image.convert("RGB")
    stream = BytesIO()
    rgb.save(stream, format="JPEG", quality=88, optimize=True, progressive=True, subsampling=0)
    stream.seek(0)
    return stream


def build() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    document = canvas.Canvas(str(OUTPUT), pageCompression=1)
    for source in SOURCES:
        with Image.open(source) as image:
            width_px, height_px = image.size
            width_pt = width_px / RENDER_DPI * POINTS_PER_INCH
            height_pt = height_px / RENDER_DPI * POINTS_PER_INCH
            document.setPageSize((width_pt, height_pt))
            document.drawImage(
                __import__("reportlab.lib.utils", fromlist=["ImageReader"]).ImageReader(compress(image)),
                0,
                0,
                width=width_pt,
                height=height_pt,
            )
            document.showPage()
    document.save()
    size = OUTPUT.stat().st_size
    if size > MAX_BYTES:
        raise RuntimeError(f"PDF size {size} exceeds {MAX_BYTES} bytes")
    print(f"Created PDF ({size} bytes; {len(SOURCES)} pages)")


if __name__ == "__main__":
    build()
