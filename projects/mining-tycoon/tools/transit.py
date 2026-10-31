# MINE-OS transit: the blast doors and the loading bar. Shared by tools/gen_server_form.py (the loading screen: the
# doors slam shut over the world, the loading bar fills) and tools/gen_hud.py (on arrival the same doors stand
# closed over the world and slide apart). Run on its own to repaint the art:  python3 projects/mining-tycoon/tools/transit.py
#
# Art (RP/textures/mining_tycoon/ui/transit/): door (steel nine-slice), door_grid (plate seams, tiled), hazard
# (yellow/black stripes, tiled), seam (the glowing door edge), emblem_l / emblem_r (the two halves of the MINE-OS
# emblem that meet when the doors close), flash, load_frame (nine-slice) + load_fill (segment tile), percent
# ("  0%".."99%", one frame each, for a flip_book).
import json
import math
import pathlib
from PIL import Image

OUT = pathlib.Path(__file__).resolve().parent.parent / 'RP/textures/mining_tycoon/ui/transit'
TEX = 'textures/mining_tycoon/ui/transit'
CYAN = (95, 246, 255)
GOLD = (255, 200, 70)
PERCENT_W, PERCENT_H = 18, 7

FONT = {'0': ['111', '101', '101', '101', '111'], '1': ['010', '110', '010', '010', '111'], '2': ['111', '001', '111', '100', '111'],
        '3': ['111', '001', '111', '001', '111'], '4': ['101', '101', '111', '001', '001'], '5': ['111', '100', '111', '001', '111'],
        '6': ['111', '100', '111', '101', '111'], '7': ['111', '001', '010', '010', '010'], '8': ['111', '101', '111', '101', '111'],
        '9': ['111', '101', '111', '001', '111'], '%': ['101', '001', '010', '100', '101'], ' ': ['000'] * 5}


def paint(size, fn):
    im = Image.new('RGBA', size, (0, 0, 0, 0))
    p = im.load()
    for y in range(size[1]):
        for x in range(size[0]):
            c = fn(x, y)
            if c:
                p[x, y] = c
    return im


def door():
    """32x32 nine-slice (8): dark steel plate, a bevel lit from the top, rivets in the corners."""
    def c(x, y):
        e = min(x, y, 31 - x, 31 - y)
        if e == 0:
            return (8, 12, 16, 255)
        if e == 1:
            return (70, 86, 96, 255) if y < 16 and x < 30 else (30, 38, 44, 255)
        if (x in (4, 27)) and (y in (4, 27)):
            return (120, 140, 150, 255)  # rivet
        if (x in (5, 28)) and (y in (5, 28)):
            return (10, 14, 18, 255)  # rivet shadow
        return (22, 30, 36, 255) if e > 2 else (28, 37, 44, 255)
    return paint((32, 32), c)


def door_grid():
    """16x16 tile: faint plate seams and a little wear."""
    def c(x, y):
        if x == 0 or y == 0:
            return (6, 10, 14, 120)
        if x == 1 or y == 1:
            return (60, 76, 86, 60)
        if (x * 7 + y * 11) % 23 == 0:
            return (40, 52, 60, 70)
        return None
    return paint((16, 16), c)


def hazard():
    return paint((8, 8), lambda x, y: (230, 180, 40, 255) if (x + y) % 8 < 4 else (24, 22, 18, 255))


def seam():
    """3 x 16: the door edge glowing cyan (bright middle column)."""
    return paint((3, 16), lambda x, y: CYAN + (255,) if x == 1 else CYAN + (110,))


def emblem():
    """48x48 MINE-OS emblem: a steel disc with a cyan ring and the gold pick (the item's art, doubled)."""
    def c(x, y):
        r = math.hypot(x - 23.5, y - 23.5)
        if r > 23.5:
            return None
        if r > 22:
            return (8, 12, 16, 255)
        if r > 19.5:
            return CYAN + (255,) if r > 20.5 else (40, 160, 175, 255)
        if r > 18.5:
            return (8, 12, 16, 255)
        shade = 30 + int(14 * (1 - r / 19))
        return (shade - 10, shade, shade + 6, 255)
    disc = paint((48, 48), c)
    pick = Image.open(OUT.parent.parent / 'items/pick_5.png').convert('RGBA').resize((32, 32), Image.NEAREST)
    disc.alpha_composite(pick, (8, 8))
    return disc


def percent_strip():
    frames = Image.new('RGBA', (PERCENT_W * 100, PERCENT_H))
    for n in range(100):
        text = f'{n:>3}%'
        for i, ch in enumerate(text):
            for gy, row in enumerate(FONT[ch]):
                for gx, bit in enumerate(row):
                    if bit == '1':
                        x, y = n * PERCENT_W + 1 + i * 4 + gx, 1 + gy
                        frames.putpixel((x + 1, y + 1), (2, 10, 14, 255))
                        frames.putpixel((x, y), CYAN + (255,))
    return frames


def write_art():
    OUT.mkdir(parents=True, exist_ok=True)
    door().save(OUT / 'door.png')
    (OUT / 'door.json').write_text(json.dumps({'nineslice_size': 8, 'base_size': [32, 32]}, indent=2) + '\n')
    door_grid().save(OUT / 'door_grid.png')
    hazard().save(OUT / 'hazard.png')
    seam().save(OUT / 'seam.png')
    em = emblem()
    em.crop((0, 0, 24, 48)).save(OUT / 'emblem_l.png')
    em.crop((24, 0, 48, 48)).save(OUT / 'emblem_r.png')
    paint((4, 4), lambda x, y: (220, 255, 255, 255)).save(OUT / 'flash.png')
    paint((8, 8), lambda x, y: CYAN + (170,) if min(x, y, 7 - x, 7 - y) == 0 else (4, 14, 20, 235)).save(OUT / 'load_frame.png')
    (OUT / 'load_frame.json').write_text(json.dumps({'nineslice_size': 2, 'base_size': [8, 8]}, indent=2) + '\n')
    paint((4, 5), lambda x, y: None if x == 3 else ((210, 255, 255, 255) if y == 0 else CYAN + (255,) if y < 4 else (26, 160, 176, 255))).save(OUT / 'load_fill.png')
    percent_strip().save(OUT / 'percent.png')


def door_controls(seq, prefix, closing):
    """The two doors as controls of a full-screen panel. seq(name, kind, steps) makes one-shot animations.
    closing: they slide in from the sides and slam shut with a shake and a flash on the seam (loading screen).
    Otherwise they stand shut, unlock with a flash and slide apart (arrival)."""
    def leaf(side):
        sign = -1 if side == 'left' else 1
        edge = 'right' if side == 'left' else 'left'  # the edge at the seam
        far = [f'{sign * 50}%', 0]
        steps = [(0.3, far, [0, 0], 'in_quad')] if closing else [(0.14, [0, 0], [0, 0]), (0.5, [0, 0], far, 'in_back')]
        return {f'door_{side}': {'type': 'panel', 'size': ['50%', '100%'], 'anchor_from': f'{side}_middle', 'anchor_to': f'{side}_middle',
                                 'offset': seq(f'{prefix}_door_{side}', 'offset', steps), 'controls': [
            {'plate': {'type': 'image', 'texture': f'{TEX}/door', 'size': ['100%', '100%'], 'layer': 1}},
            {'grid': {'type': 'image', 'texture': f'{TEX}/door_grid', 'size': ['100% - 4px', '100% - 4px'], 'tiled': True, 'layer': 2}},
            {'hazard': {'type': 'image', 'texture': f'{TEX}/hazard', 'size': [8, '100%'], 'tiled': True, 'layer': 3,
                        'anchor_from': f'{edge}_middle', 'anchor_to': f'{edge}_middle', 'offset': [-4 if side == 'left' else 4, 0]}},  # beside the glowing seam
            {'seam': {'type': 'image', 'texture': f'{TEX}/seam', 'size': [3, '100%'], 'keep_ratio': False, 'layer': 4,
                      'anchor_from': f'{edge}_middle', 'anchor_to': f'{edge}_middle'}},
            {'emblem': {'type': 'image', 'texture': f'{TEX}/emblem_{"l" if side == "left" else "r"}', 'size': [24, 48], 'layer': 5,
                        'anchor_from': f'{edge}_middle', 'anchor_to': f'{edge}_middle',
                        # on the loading screen it steps back behind the panel once the doors are shut
                        **({'alpha': seq(f'{prefix}_emblem_{side}', 'alpha', [(0.5, 1, 1), (0.4, 1, 0.12, 'in_out_sine')])} if closing else {})}},
        ]}}
    flash_steps = [(0.28, 0, 0), (0.04, 0, 1), (0.45, 1, 0, 'out_quad')] if closing else [(0.04, 0, 0.9), (0.3, 0.9, 0, 'out_quad')]
    shake = [(0.3, [0, 0], [0, 0]), (0.04, [0, 0], [0, 2]), (0.05, [0, 2], [0, -1]), (0.06, [0, -1], [0, 0])] if closing else [(0.1, [0, 0], [0, 0])]
    return [{'doors': {'type': 'panel', 'size': ['100%', '100%'], 'offset': seq(f'{prefix}_doors_shake', 'offset', shake), 'controls': [
        leaf('left'), leaf('right'),
        {'flash': {'type': 'image', 'texture': f'{TEX}/flash', 'size': [14, '100%'], 'keep_ratio': False, 'layer': 8,
                   'alpha': seq(f'{prefix}_door_flash', 'alpha', flash_steps)}},
    ]}}]


if __name__ == '__main__':
    write_art()
    print('written', OUT)
