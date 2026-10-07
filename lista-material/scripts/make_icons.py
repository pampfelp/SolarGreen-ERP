from PIL import Image, ImageDraw
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
for size in (512, 192, 180, 32, 16):
    image = Image.new("RGB", (size, size), "#06241a")
    draw = ImageDraw.Draw(image)
    s = size / 512
    def box(coords, fill, radius=0, width=1):
        xy = tuple(round(v * s) for v in coords)
        if radius:
            draw.rounded_rectangle(xy, radius=round(radius*s), fill=fill, width=round(width*s))
        else:
            draw.rectangle(xy, fill=fill, width=round(width*s))
    box((45, 45, 467, 467), "#0d3828", 90)
    box((96, 112, 416, 290), "#78d800", 22)
    for x in (202, 308):
        box((x-3, 112, x+3, 290), "#06241a")
    box((96, 196, 416, 202), "#06241a")
    for y in (340, 386):
        box((100, y, 135, y+25), "#78d800", 6)
        box((160, y+7, 407, y+19), "#ffffff", 6)
    name = {512: "icon-512.png", 192: "icon-192.png", 180: "apple-touch-icon.png",
            32: "favicon-32.png", 16: "favicon-16.png"}[size]
    image.save(ROOT / name)
Image.open(ROOT / "favicon-32.png").save(ROOT / "favicon.ico", sizes=[(16, 16), (32, 32)])
