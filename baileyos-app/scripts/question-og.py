"""Rebuild the Question #001 share image from the supplied 360° Brewing logo.

The 200px logo is enlarged to 460px with Lanczos resampling and a light unsharp mask.
The logo and the two lines sit in the center of the 1200x627 card.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[1]
LOGO = ROOT / 'public' / 'brew' / '360-brewing-logo.jpg'
OUT = ROOT / 'public' / 'brew' / 'question-001.png'
LOGO_PX = 460

def main() -> None:
    logo = Image.open(LOGO).convert('RGB')
    logo = logo.resize((LOGO_PX, LOGO_PX), Image.Resampling.LANCZOS)
    logo = logo.filter(ImageFilter.UnsharpMask(radius=1.2, percent=70, threshold=2))
    canvas = Image.new('RGB', (1200, 627), (0x12, 0x12, 0x14))
    title_font = ImageFont.truetype('/usr/share/fonts/truetype/macos/Inter-SemiBold.ttf', 54)
    body_font = ImageFont.truetype('/usr/share/fonts/truetype/macos/Inter-Regular.ttf', 28)
    draw = ImageDraw.Draw(canvas)
    title, body = 'Question #001', 'One verified person, one vote.'
    title_box = draw.textbbox((0, 0), title, font=title_font)
    body_box = draw.textbbox((0, 0), body, font=body_font)
    gap = 16
    text_w = max(title_box[2] - title_box[0], body_box[2] - body_box[0])
    text_h = (title_box[3] - title_box[1]) + gap + (body_box[3] - body_box[1])
    space = 48
    group_w = LOGO_PX + space + text_w
    group_x = (1200 - group_w) // 2
    logo_y = (627 - LOGO_PX) // 2
    canvas.paste(logo, (group_x, logo_y))
    text_x = group_x + LOGO_PX + space
    text_y = (627 - text_h) // 2 - title_box[1]
    draw.text((text_x, text_y), title, font=title_font, fill=(255, 255, 255))
    draw.text((text_x, text_y + (title_box[3] - title_box[1]) + gap), body, font=body_font, fill=(232, 232, 234))
    canvas.save(OUT, 'PNG')

if __name__ == '__main__':
    main()
