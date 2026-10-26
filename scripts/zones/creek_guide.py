"""Rusty Creek stacked cross-section guide, painted in plausible colours (not a colour key).

guide-a.png: everything drawn here.  guide-b.png: the top is the real before-center.png, underground drawn here.
2176x1088 overview of a zone about 3 chunks wide (hero ~27 px here, 80 px in game).
"""
import math, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

ROOT = next(p for p in Path(__file__).resolve().parents if (p / "scripts" / "make_boards.py").exists())
HERE = ROOT / "tmp" / "zones" / "creek"  # takes, guides and raw output (gitignored)
OUT = HERE
W, H = 2176, 1088
WATER_Y = 600          # creek surface
PATH_Y = 575           # cement creek path top (left and right banks)

def curve(points, step=4):
    p = [points[0]] + points + [points[-1]]
    out = []
    for i in range(1, len(p) - 2):
        p0, p1, p2, p3 = p[i - 1], p[i], p[i + 1], p[i + 2]
        n = max(2, int(math.dist(p1, p2) / step))
        for k in range(n):
            t = k / n
            out.append(tuple(0.5 * ((2 * p1[j]) + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t * t
                                    + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t ** 3) for j in range(2)))
    out.append(points[-1])
    return out

def sky(img):
    d = ImageDraw.Draw(img)
    for y in range(H):
        t = y / 600
        d.line([(0, y), (W, y)], fill=(int(90 + 120 * t), int(150 + 70 * t), int(235 - 10 * t)))
    for cx, cy, r in [(300, 90, 60), (380, 80, 45), (900, 120, 50), (1500, 70, 70), (1590, 90, 45), (2000, 140, 40)]:
        d.ellipse((cx - r * 2, cy - r, cx + r * 2, cy + r), fill=(245, 245, 240))

def trees(img):
    d = ImageDraw.Draw(img)
    import random
    random.seed(4)
    for _ in range(260):
        x = random.randint(-40, W + 40); y = random.randint(330, 560); r = random.randint(30, 70)
        c = random.choice([(214, 160, 40), (196, 120, 30), (180, 70, 30), (120, 140, 50), (230, 190, 70)])
        d.ellipse((x - r, y - r, x + r, y + r), fill=c)

def top(img):
    """Banks, creek path, rail embankment, bridges, ladders."""
    d = ImageDraw.Draw(img)
    # soft banks: left rail embankment rises to the bridge deck, right bank lower
    left = curve([(0, 300), (120, 310), (260, 380), (360, 470), (430, PATH_Y), (470, PATH_Y + 10)])
    d.polygon(left + [(470, WATER_Y + 30), (0, WATER_Y + 30)], fill=(96, 110, 50))
    right = curve([(1720, PATH_Y + 10), (1790, PATH_Y), (1880, 500), (2000, 440), (2176, 420)])
    d.polygon(right + [(2176, WATER_Y + 30), (1720, WATER_Y + 30)], fill=(96, 110, 50))
    # cement creek path along the water, both banks and a ledge under the bridge
    d.rectangle((0, PATH_Y, 2176, PATH_Y + 18), fill=(170, 165, 150))
    # railway plate-girder bridge, high, with rails on top, on two concrete piers
    d.rectangle((0, 260, W, 330), fill=(110, 140, 130))
    d.rectangle((0, 250, W, 262), fill=(90, 70, 50))  # ballast/rails
    for x in range(0, W, 90):
        d.line([(x, 262), (x, 330)], fill=(60, 80, 70), width=4)
    for px in (640, 1500):
        d.rectangle((px, 330, px + 110, WATER_Y + 60), fill=(150, 145, 135))
    # lower steel footbridge / pipe bridge with a truss, a deck you climb to
    d.rectangle((760, 440, 1380, 456), fill=(120, 100, 80))
    for x in range(760, 1380, 62):
        d.line([(x, 456), (x + 31, 400), (x + 62, 456)], fill=(110, 140, 130), width=6)
    d.rectangle((760, 396, 1380, 404), fill=(110, 140, 130))
    # ladders: path -> footbridge, footbridge -> rail bridge maintenance walk, signal mast on the right
    for x, y0, y1 in [(790, 456, PATH_Y), (1340, 330, 440), (1860, 180, 500)]:
        d.line([(x, y0), (x, y1)], fill=(60, 50, 40), width=4); d.line([(x + 22, y0), (x + 22, y1)], fill=(60, 50, 40), width=4)
        for y in range(y0, y1, 13):
            d.line([(x, y), (x + 22, y)], fill=(60, 50, 40), width=2)
    d.rectangle((1830, 170, 1910, 184), fill=(110, 140, 130))  # signal gantry top
    # railing along the path
    for x in range(0, W, 120):
        d.line([(x, PATH_Y - 40), (x, PATH_Y)], fill=(130, 130, 125), width=5)
    d.line([(0, PATH_Y - 40), (W, PATH_Y - 40)], fill=(130, 130, 125), width=5)

def water(img):
    d = ImageDraw.Draw(img)
    d.rectangle((0, WATER_Y, W, 700), fill=(60, 110, 160))
    for y in range(WATER_Y + 8, 700, 10):
        d.line([(0, y), (W, y)], fill=(90, 140, 190), width=1)

def underground(img):
    """Built campus space under the creek: culvert, storm drain, pump room, service tunnel, flooded basement."""
    earth = Image.new("L", (W, H), 0)
    e = ImageDraw.Draw(earth)
    e.rectangle((0, 700, W, H), fill=255)
    soil = Image.new("RGB", (W, H), (52, 44, 40))
    img.paste(soil, mask=earth.filter(ImageFilter.GaussianBlur(6)))
    d = ImageDraw.Draw(img)
    conc, dark, lamp, pool = (128, 124, 116), (70, 70, 70), (255, 210, 120), (40, 90, 120)
    # concrete embankment wall under the water line
    d.rectangle((0, 700, W, 740), fill=dark)
    # 1 culvert: a big round pipe mouth in the left bank at water level, running down into the storm drain
    d.ellipse((150, 560, 330, 740), fill=dark); d.ellipse((168, 578, 312, 722), fill=(25, 25, 30))
    # 2 storm drain: long arched tunnel, left, with a channel of water in its floor
    d.rounded_rectangle((60, 780, 700, 1040), radius=110, fill=conc)
    d.rounded_rectangle((90, 805, 670, 1015), radius=95, fill=(150, 146, 136))
    d.rectangle((90, 985, 670, 1015), fill=pool)
    d.rectangle((210, 740, 290, 800), fill=(150, 146, 136))  # shaft from culvert
    # 3 pump room: tall hall with two big pumps, pipes, a catwalk
    d.rectangle((760, 760, 1240, 1060), fill=(160, 150, 130))
    for cx in (880, 1100):
        d.rounded_rectangle((cx - 60, 900, cx + 60, 1050), radius=30, fill=(80, 120, 120))
        d.rectangle((cx - 12, 770, cx + 12, 900), fill=(90, 110, 110))
    d.rectangle((770, 860, 1230, 870), fill=(70, 70, 60))
    # 4 service tunnel: long low-ish corridor with cable trays, leading right
    d.rectangle((1240, 860, 1620, 1040), fill=(140, 140, 132))
    for y in (880, 900):
        d.line([(1250, y), (1610, y)], fill=(50, 60, 70), width=6)
    # 5 the flooded basement under the right bank: still black water, reflection
    d.rectangle((1620, 760, 2120, 1060), fill=(120, 130, 135))
    d.rectangle((1640, 930, 2100, 1050), fill=(30, 50, 70))
    # lamps
    for x, y in [(220, 830), (450, 830), (640, 830), (840, 790), (1000, 790), (1170, 790), (1320, 920), (1520, 920), (1700, 800), (1950, 800)]:
        d.ellipse((x - 9, y - 9, x + 9, y + 9), fill=lamp)

HERE.mkdir(parents=True, exist_ok=True)


def build(name, real_top):
    img = Image.new("RGB", (W, H))
    sky(img); trees(img); top(img); water(img)
    if real_top:
        ref = Image.open(ROOT / "art/stages/rusty-creek/prototype/before-center.png").convert("RGB")
        # bridge photo-painting: scale to full width, its water line (y~595 of 720) to WATER_Y+?
        ref = ref.resize((W, int(720 * W / 2160)))
        img.paste(ref.crop((0, 0, W, 640)), (0, 0))
        ImageDraw.Draw(img).rectangle((0, 640, W, 700), fill=(60, 110, 160))
    underground(img)
    img.filter(ImageFilter.GaussianBlur(1.2)).save(OUT / name)

build("guide-a.png", False)
build("guide-b.png", True)
print("ok")
