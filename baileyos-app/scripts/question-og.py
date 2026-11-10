"""Rebuild the Question #001 share image from the supplied 360° Brewing logo.

The logo is pasted at its native 200px. It is not enlarged.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
LOGO = ROOT / 'public' / 'brew' / '360-brewing-logo.jpg'
OUT = ROOT / 'public' / 'brew' / 'question-001.png'

def main() -> None:
    logo = Image.open(LOGO).convert('RGB')
    canvas = Image.new('RGB', (1200, 627), (0x12, 0x12, 0x14))
    x, y = 96, (627 - logo.height) // 2
    canvas.paste(logo, (x, y))
    title_font = ImageFont.truetype('/usr/share/fonts/truetype/macos/Inter-SemiBold.ttf', 64)
    body_font = ImageFont.truetype('/usr/share/fonts/truetype/macos/Inter-Regular.ttf', 32)
    draw = ImageDraw.Draw(canvas)
    title, body = 'Question #001', 'One verified person, one vote.'
    title_box = draw.textbbox((0, 0), title, font=title_font)
    body_box = draw.textbbox((0, 0), body, font=body_font)
    gap = 18
    block_h = (title_box[3] - title_box[1]) + gap + (body_box[3] - body_box[1])
    text_x = x + logo.width + 72
    text_y = y + (logo.height - block_h) // 2 - title_box[1]
    draw.text((text_x, text_y), title, font=title_font, fill=(255, 255, 255))
    draw.text((text_x, text_y + (title_box[3] - title_box[1]) + gap), body, font=body_font, fill=(232, 232, 234))
    canvas.save(OUT, 'PNG')

if __name__ == '__main__':
    main()
