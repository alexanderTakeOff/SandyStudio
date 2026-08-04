from pathlib import Path

from PIL import Image, ImageDraw
import pypdfium2 as pdfium


INPUT = Path(r"C:\SandyStudio\output\pdf\Соглашение_страницы_1-6.pdf")
OUTPUT = Path(r"C:\SandyStudio\tmp\pdfs\rendered")


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    pdf = pdfium.PdfDocument(INPUT)
    previews = []
    for index in range(len(pdf)):
        image = pdf[index].render(scale=1.25).to_pil()
        image.save(OUTPUT / f"page-{index + 1:02d}.png")
        image.thumbnail((220, 320))
        previews.append(image.copy())

    contact = Image.new("RGB", (660, 700), "white")
    draw = ImageDraw.Draw(contact)
    for index, image in enumerate(previews):
        x = (index % 3) * 220
        y = (index // 3) * 350 + 20
        contact.paste(image, (x + (220 - image.width) // 2, y))
        draw.text((x + 8, y + 325), f"PDF page {index + 1}", fill="black")
    contact.save(OUTPUT / "contact-sheet.png")
    print(f"Rendered {len(pdf)} pages")


if __name__ == "__main__":
    main()
