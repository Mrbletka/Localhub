# Renders the art of the MINE-OS welcome menu (the start menu's "holo terminal" look), written to
# RP/textures/mining_tycoon/ui/tech/. Run after changing it:  python3 projects/mining-tycoon/tools/gen_tech.py
#
# - holo_print / holo_spin: a holographic ore block printed layer by layer by a rising laser (intro), then turning in
#   the projector beam (loop). Rendered here with a tiny 3D rasteriser, played by flip_book animations.
# - radar: the ore radar - a sweep that lights ore blips (gold, ruby, diamond) which fade until it comes round again.
# - glass buttons (nine-slice, chamfered corners, cyan rim), a light streak, scanlines, vignette, corner brackets.
# Frames sit side by side in one strip per animation (flip_book steps along x); strips stay within 2048 px (older
# phones cannot load wider textures).
import json
import math
import pathlib
from PIL import Image, ImageDraw, ImageFilter

OUT = pathlib.Path(__file__).resolve().parent.parent / 'RP/textures/mining_tycoon/ui/tech'
CYAN = (95, 246, 255)
GOLD = (255, 205, 90)
ORES = {(1, 2): (255, 200, 70), (2, 5): (255, 90, 110), (5, 1): (140, 240, 255), (6, 6): (255, 200, 70), (4, 4): (255, 90, 110),
        (3, 1): (140, 240, 255), (6, 3): (255, 200, 70), (1, 6): (140, 240, 255)}  # ore specks on each face (8x8 grid)
HOLO = 112  # hologram frame size
SPIN_FRAMES, PRINT_FRAMES = 18, 18
RADAR, RADAR_FRAMES = 96, 20


def rot(p, yaw, pitch):
    x, y, z = p
    c, s = math.cos(yaw), math.sin(yaw)
    x, z = x * c - z * s, x * s + z * c
    c, s = math.cos(pitch), math.sin(pitch)
    y, z = y * c - z * s, y * s + z * c
    return x, y, z


def quads():
    """The block's faces as 8x8 tiles: (corner points in -0.5..0.5, tile x, tile y, face id, height of the tile)."""
    out = []
    n = 8
    for face in range(6):
        for i in range(n):
            for j in range(n):
                a, b, a2, b2 = i / n - 0.5, j / n - 0.5, (i + 1) / n - 0.5, (j + 1) / n - 0.5
                if face == 0: pts = [(a, 0.5, b), (a2, 0.5, b), (a2, 0.5, b2), (a, 0.5, b2)]          # top
                elif face == 1: pts = [(a, -0.5, b), (a2, -0.5, b), (a2, -0.5, b2), (a, -0.5, b2)]    # bottom
                elif face == 2: pts = [(a, b, 0.5), (a2, b, 0.5), (a2, b2, 0.5), (a, b2, 0.5)]        # south
                elif face == 3: pts = [(a, b, -0.5), (a2, b, -0.5), (a2, b2, -0.5), (a, b2, -0.5)]    # north
                elif face == 4: pts = [(0.5, b, a), (0.5, b, a2), (0.5, b2, a2), (0.5, b2, a)]        # east
                else: pts = [(-0.5, b, a), (-0.5, b, a2), (-0.5, b2, a2), (-0.5, b2, a)]              # west
                height = sum(p[1] for p in pts) / 4
                out.append((pts, i, j, face, height))
    return out


QUADS = quads()


def holo_frame(yaw, scan, printed, flicker=1.0):
    """One hologram frame. scan: height of the laser plane (-0.5..0.5) or None; printed: tiles up to this height exist."""
    S = 4  # supersampling
    W = HOLO * S
    img = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    d = ImageDraw.Draw(img, 'RGBA')
    pitch = -0.42
    scale = W * 0.42
    cx, cy = W / 2, W * 0.46
    # projector beam: a soft cone from the bottom
    beam = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    bd = ImageDraw.Draw(beam, 'RGBA')
    for k in range(40):
        t = k / 40
        bd.polygon([(cx - W * 0.06 - t * W * 0.3, W * 0.98 - t * W * 0.62), (cx + W * 0.06 + t * W * 0.3, W * 0.98 - t * W * 0.62),
                    (cx + W * 0.06 + (t + 0.025) * W * 0.3, W * 0.98 - (t + 0.025) * W * 0.62), (cx - W * 0.06 - (t + 0.025) * W * 0.3, W * 0.98 - (t + 0.025) * W * 0.62)],
                   fill=CYAN + (int(26 * (1 - t) * flicker),))
    img.alpha_composite(beam)
    proj = []
    for pts, i, j, face, h in QUADS:
        if h > printed:
            continue
        r = [rot(p, yaw, pitch) for p in pts]
        depth = sum(p[2] for p in r) / 4
        poly = [(cx + p[0] * scale, cy - p[1] * scale) for p in r]
        normal_z = (r[1][0] - r[0][0]) * (r[2][1] - r[0][1]) - (r[1][1] - r[0][1]) * (r[2][0] - r[0][0])
        proj.append((depth, poly, i, j, face, h, normal_z))
    proj.sort(key=lambda q: q[0])  # far first
    for depth, poly, i, j, face, h, nz in proj:
        front = depth < 0.05
        ore = ORES.get((i, j)) if face in (0, 2, 3, 4, 5) else None
        near_scan = scan is not None and abs(h - scan) < 0.07
        if ore:
            col, a = ore, 230 if front else 100
        else:
            col, a = CYAN, (95 if front else 30)
        if near_scan:
            col, a = (230, 255, 255), 235
        d.polygon(poly, fill=col + (int(a * flicker),), outline=(170, 252, 255) + (int((190 if front else 60) * flicker),))
    # scan plane: a bright elliptic ring at the laser height
    if scan is not None:
        ring = [rot((math.cos(t) * 0.78, scan, math.sin(t) * 0.78), yaw, pitch) for t in [k * math.pi / 24 for k in range(49)]]
        pts = [(cx + p[0] * scale, cy - p[1] * scale) for p in ring]
        d.line(pts, fill=(200, 255, 255, int(220 * flicker)), width=S * 2)
        d.line(pts, fill=CYAN + (int(90 * flicker),), width=S * 6)
    # hologram scanlines
    for y in range(0, W, S * 3):
        d.line([(0, y), (W, y)], fill=(0, 0, 0, 45), width=S)
    img = img.resize((HOLO, HOLO), Image.LANCZOS)
    glow = img.filter(ImageFilter.GaussianBlur(2.2))
    out = Image.new('RGBA', (HOLO, HOLO), (0, 0, 0, 0))
    out.alpha_composite(glow)
    out.alpha_composite(img)
    return out


def strip(frames):
    w, h = frames[0].size
    sheet = Image.new('RGBA', (w * len(frames), h), (0, 0, 0, 0))
    for k, f in enumerate(frames):
        sheet.alpha_composite(f, (k * w, 0))
    assert sheet.width <= 2048, sheet.width
    return sheet


def holo_strips():
    printing = []
    for k in range(PRINT_FRAMES):
        t = (k + 1) / PRINT_FRAMES
        h = -0.55 + t * 1.12
        printing.append(holo_frame(0.35 + t * 0.6, h, h, 0.85 + 0.15 * (k % 2)))
    spin = []
    for k in range(SPIN_FRAMES):
        yaw = 0.95 + k * 2 * math.pi / SPIN_FRAMES
        scan = -0.5 + (k / SPIN_FRAMES) * 2.2 if k < SPIN_FRAMES // 2 else None  # a scan pass every turn
        spin.append(holo_frame(yaw, scan, 1, 0.92 if k % 9 == 4 else 1.0))
    return strip(printing), strip(spin)


def radar_strip():
    blips = [(0.35, 30, GOLD), (0.62, 110, (255, 90, 110)), (0.8, 200, (140, 240, 255)), (0.5, 250, GOLD), (0.25, 320, (255, 90, 110)),
             (0.72, 160, GOLD), (0.9, 290, (140, 240, 255))]
    frames = []
    S = 4
    W = RADAR * S
    for k in range(RADAR_FRAMES):
        sweep = k * 360 / RADAR_FRAMES
        img = Image.new('RGBA', (W, W), (0, 0, 0, 0))
        d = ImageDraw.Draw(img, 'RGBA')
        c = W / 2
        R = W * 0.46
        d.ellipse([c - R, c - R, c + R, c + R], fill=(6, 24, 32, 150))
        # sweep trail: a fan of fading wedges behind the sweep line
        for t in range(60):
            a0 = sweep - t * 1.6
            d.pieslice([c - R, c - R, c + R, c + R], a0 - 1.8, a0, fill=CYAN + (int(70 * (1 - t / 60) ** 2),))
        for frac in (0.33, 0.66, 1.0):
            r = R * frac
            d.ellipse([c - r, c - r, c + r, c + r], outline=CYAN + (110,), width=S)
        d.line([(c - R, c), (c + R, c)], fill=CYAN + (60,), width=S)
        d.line([(c, c - R), (c, c + R)], fill=CYAN + (60,), width=S)
        for tick in range(0, 360, 15):
            a = math.radians(tick)
            r1 = R * (0.9 if tick % 45 else 0.84)
            d.line([(c + math.cos(a) * r1, c + math.sin(a) * r1), (c + math.cos(a) * R, c + math.sin(a) * R)], fill=GOLD + (170,), width=S)
        a = math.radians(sweep)
        d.line([(c, c), (c + math.cos(a) * R, c + math.sin(a) * R)], fill=(220, 255, 255, 240), width=S * 2)
        for r, ang, col in blips:
            since = (sweep - ang) % 360
            bright = max(0.0, 1 - since / 300)
            if bright <= 0.02:
                continue
            x, y = c + math.cos(math.radians(ang)) * R * r, c + math.sin(math.radians(ang)) * R * r
            size = S * (3 + 3 * bright)
            d.ellipse([x - size * 2, y - size * 2, x + size * 2, y + size * 2], fill=col + (int(60 * bright),))
            d.ellipse([x - size, y - size, x + size, y + size], fill=col + (int(255 * bright),))
        img = img.resize((RADAR, RADAR), Image.LANCZOS)
        glow = img.filter(ImageFilter.GaussianBlur(1.5))
        out = Image.new('RGBA', (RADAR, RADAR), (0, 0, 0, 0))
        out.alpha_composite(glow)
        out.alpha_composite(img)
        frames.append(out)
    return strip(frames)


def glass(rim, fill, accent):
    """16x16 nine-slice glass panel with chamfered corners."""
    im = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    p = im.load()
    for y in range(16):
        for x in range(16):
            cut = min(x, 15 - x) + min(y, 15 - y)
            if cut < 2:
                continue  # chamfered corner
            edge = min(x, y, 15 - x, 15 - y)
            if cut == 2 or edge == 0:
                p[x, y] = rim
            elif edge == 1 and y <= 1:
                p[x, y] = accent
            else:
                p[x, y] = fill
    return im


def write_meta(name, base=(16, 16), nine=4):
    (OUT / f'{name}.json').write_text(json.dumps({'nineslice_size': nine, 'base_size': list(base)}, indent=2) + '\n')


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    printing, spin = holo_strips()
    printing.save(OUT / 'holo_print.png')
    spin.save(OUT / 'holo_spin.png')
    radar_strip().save(OUT / 'radar.png')
    glass((95, 246, 255, 230), (6, 22, 30, 200), (180, 250, 255, 160)).save(OUT / 'glass.png')
    glass((255, 210, 110, 255), (16, 44, 56, 225), (255, 240, 190, 220)).save(OUT / 'glass_hover.png')
    glass((255, 230, 160, 255), (40, 120, 140, 235), (255, 255, 230, 255)).save(OUT / 'glass_pressed.png')
    glass((95, 246, 255, 140), (4, 12, 18, 170), (95, 246, 255, 90)).save(OUT / 'panel.png')
    for name in ('glass', 'glass_hover', 'glass_pressed', 'panel'):
        write_meta(name)
    # a diagonal light streak that sweeps across buttons
    streak = Image.new('RGBA', (24, 32), (0, 0, 0, 0))
    sd = ImageDraw.Draw(streak, 'RGBA')
    for k in range(12):
        sd.polygon([(8 + k, 0), (12 + k, 0), (4 + k, 32), (0 + k, 32)], fill=(255, 255, 255, int(55 * math.sin(math.pi * k / 11))))
    streak.save(OUT / 'streak.png')
    # scanlines (4 px repeat: one dark line) and the screen vignette
    lines = Image.new('RGBA', (4, 4), (0, 0, 0, 0))
    for x in range(4):
        lines.putpixel((x, 0), (0, 0, 0, 70))
        lines.putpixel((x, 2), (95, 246, 255, 10))
    lines.save(OUT / 'scanlines.png')
    vig = Image.new('RGBA', (128, 64), (0, 0, 0, 0))
    for y in range(64):
        for x in range(128):
            dx, dy = (x - 63.5) / 64, (y - 31.5) / 32
            vig.putpixel((x, y), (2, 8, 12, int(255 * min(1, max(0, (dx * dx + dy * dy) ** 1.4 * 0.9)))))
    vig.save(OUT / 'vignette.png')
    tint = Image.new('RGBA', (4, 4), (3, 14, 20, 175))
    tint.save(OUT / 'tint.png')
    # corner bracket (top-left; the others are the same image flipped)
    br = Image.new('RGBA', (12, 12), (0, 0, 0, 0))
    bd = ImageDraw.Draw(br)
    bd.line([(0, 0), (11, 0)], fill=CYAN + (255,), width=2)
    bd.line([(0, 0), (0, 11)], fill=CYAN + (255,), width=2)
    bd.point([(3, 3)], fill=GOLD + (255,))
    br.save(OUT / 'bracket.png')
    for name, flip in (('bracket_tr', Image.FLIP_LEFT_RIGHT), ('bracket_bl', Image.FLIP_TOP_BOTTOM)):
        br.transpose(flip).save(OUT / f'{name}.png')
    br.transpose(Image.ROTATE_180).save(OUT / 'bracket_br.png')
    # a thin glowing line (boot text underline, CRT power-on line)
    line = Image.new('RGBA', (64, 3), (0, 0, 0, 0))
    for x in range(64):
        a = int(255 * math.sin(math.pi * x / 63))
        line.putpixel((x, 0), CYAN + (a // 4,))
        line.putpixel((x, 1), (230, 255, 255, a))
        line.putpixel((x, 2), CYAN + (a // 4,))
    line.save(OUT / 'line.png')
    print('tech art:', ', '.join(sorted(p.name for p in OUT.glob('*.png'))))


if __name__ == '__main__':
    main()
