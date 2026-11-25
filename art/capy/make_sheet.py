"""Compose renders into a labelled grid (system Python + Pillow).

  python art/capy/make_sheet.py IN_DIR OUT.png [--cols 4] [--tile 480] [--title "..."]
         [--order A,B,C] [--captions none]
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

ORDER = ["Calm", "Focused", "Happy", "Celebrate", "Proud", "Sleepy", "Worried", "Chilly", "Sad", "Grumpy", "Confused", "Surprised"]
CAPTIONS = {
    "Calm": "New day, no essay yet",
    "Focused": "Writing right now",
    "Happy": "Today's essay is in",
    "Celebrate": "New piece earned",
    "Proud": "7-day freeze earned / world done",
    "Sleepy": "Late night / back after a break",
    "Worried": "Evening, streak at risk",
    "Chilly": "A freeze covered yesterday",
    "Sad": "Streak reset (rain cloud)",
    "Grumpy": "Huffy at the rain / poked too much",
    "Confused": "Prompt or essay missing",
    "Surprised": "Tapped / poked",
}


def font(size, bold=False):
    for name in (("seguisb.ttf" if bold else "segoeui.ttf"), "arial.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def opt(name, default=None):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


def main():
    src, out = sys.argv[1], sys.argv[2]
    cols = int(opt("--cols", 4))
    tile = opt("--tile")
    title = opt("--title", "Capy — streak emotions")
    order = opt("--order", ",".join(ORDER)).split(",")
    captions = opt("--captions", "on") != "none"
    names = [n for n in order if os.path.exists(os.path.join(src, f"{n}.png"))]
    tiles = [Image.open(os.path.join(src, f"{n}.png")).convert("RGB") for n in names]
    if tile:
        tiles = [t.resize((int(tile), int(tile)), Image.LANCZOS) for t in tiles]
    w, h = tiles[0].size
    k = w / 480
    pad, cap = int(18 * k), int((74 if captions else 46) * k)
    head = int(70 * k)
    rows = (len(tiles) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * (w + pad) + pad, rows * (h + cap + pad) + pad + head), (255, 249, 242))
    d = ImageDraw.Draw(sheet)
    d.text((pad, int(20 * k)), title, fill=(69, 58, 51), font=font(int(34 * k), True))
    f1, f2 = font(int(26 * k), True), font(int(19 * k))
    for i, (n, im) in enumerate(zip(names, tiles)):
        x = pad + (i % cols) * (w + pad)
        y = head + pad + (i // cols) * (h + cap + pad)
        sheet.paste(im, (x, y))
        d.rounded_rectangle((x, y + h, x + w, y + h + cap), radius=int(10 * k), fill=(255, 253, 249), outline=(233, 226, 216))
        d.text((x + int(16 * k), y + h + int(8 * k)), n, fill=(112, 88, 143), font=f1)
        if captions:
            d.text((x + int(16 * k), y + h + int(42 * k)), CAPTIONS.get(n, ""), fill=(108, 98, 89), font=f2)
    sheet.save(out, optimize=True)
    print(out, sheet.size, os.path.getsize(out) // 1024, "KB")


main()
