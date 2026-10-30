# Generates the 3D block models of the mine's furniture and their shared texture atlas:
#   RP/models/blocks/<name>.geo.json, RP/textures/mining_tycoon/blocks/props.png (still) and props_on.png (animated:
#   4 frames, RP/textures/flipbook_textures.json), the BP block files of the modelled blocks, and 16x16 menu icons
#   (RP/textures/mining_tycoon/blocks/<name>_front.png).
# Run after changing a model or a tile:  python3 projects/mining-tycoon/tools/gen_models.py
#
# Every model is a list of cubes in block pixels (x/z -8..8, y 0..16; the front faces north, -z). Each face shows one
# 16x16 tile of the atlas (an 8x8 grid of tiles). Machines come in two blocks: "<id>" (idle, still atlas) and
# "<id>_on" (working, animated atlas: fire, turning rollers, spinning blade) - machines.js swaps them.
import json
import math
import pathlib
from PIL import Image

PROJECT = pathlib.Path(__file__).resolve().parent.parent
RP, BP = PROJECT / 'RP', PROJECT / 'BP'
TEX = RP / 'textures/mining_tycoon/blocks'
NS = 'mining_tycoon'
FRAMES = 4


def hexc(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (255,)


def noise(x, y, seed=0):
    return ((x * 73856093) ^ (y * 19349663) ^ (seed * 83492791)) % 97 / 97


# ---- tiles (16x16, painted per frame; `on` is the animated atlas) -----------------------------------------------
def tile(fn):
    TILES[fn.__name__] = fn
    return fn


TILES = {}


def blank():
    return Image.new('RGBA', (16, 16), (0, 0, 0, 0))


def fill(im, color_fn):
    p = im.load()
    for y in range(16):
        for x in range(16):
            c = color_fn(x, y)
            if c:
                p[x, y] = hexc(c) if isinstance(c, str) else c
    return im


@tile
def brick(f, on):
    def c(x, y):
        row = y // 4
        bx = (x + (2 if row % 2 else 0)) % 8
        if y % 4 == 3 or bx == 7:
            return '#3e3c3a'
        if y % 4 == 0:
            return '#8a8784'
        return '#74716e' if noise(x, y, 1) > 0.25 else '#65625f'
    return fill(blank(), c)


@tile
def brick_dark(f, on):
    def c(x, y):
        row = y // 4
        bx = (x + (2 if row % 2 else 0)) % 8
        if y % 4 == 3 or bx == 7:
            return '#262422'
        return '#4e4b48' if noise(x, y, 2) > 0.3 else '#43403d'
    return fill(blank(), c)


@tile
def furnace_front(f, on):
    im = brick(f, on)
    p = im.load()
    for y in range(5, 15):
        for x in range(3, 13):
            arch = y >= 7 or (x - 7.5) ** 2 + (y - 7.5) ** 2 <= 16
            if not arch:
                continue
            edge = x in (3, 12) or y == 14 or (y < 7 and (x - 7.5) ** 2 + (y - 7.5) ** 2 > 10)
            if edge:
                p[x, y] = hexc('#2a2422')
            elif not on:
                p[x, y] = hexc('#1c1410' if y < 12 else '#3a2a20')
            else:
                h = 14 - y + ((x * 3 + f * 5) % 4) - 1.5 * math.sin((x + f * 2) * 1.3)
                p[x, y] = hexc('#fff3b0' if h < 2.5 else '#ffc84a' if h < 4.5 else '#ff8a24' if h < 6.5 else '#c8401a' if h < 8 else '#3a1a0c')
    return im


@tile
def steel(f, on):
    def c(x, y):
        if x in (0, 15) or y in (0, 15):
            return '#2b2f36'
        if (x, y) in ((2, 2), (13, 2), (2, 13), (13, 13)):
            return '#b4bcc6'
        return '#6e7682' if noise(x, y, 3) > 0.15 else '#636b77'
    return fill(blank(), c)


@tile
def steel_dark(f, on):
    return fill(blank(), lambda x, y: '#23262c' if x in (0, 15) or y in (0, 15) else '#454b55' if noise(x, y, 4) > 0.2 else '#3d424b')


@tile
def crusher_front(f, on):
    im = steel(f, on)
    p = im.load()
    for y in range(3, 12):
        for x in range(2, 14):
            p[x, y] = hexc('#121316')
    turn = f * (math.pi / 8) if on else 0
    for cx, sign in ((5.0, 1), (10.5, -1)):
        for y in range(3, 12):
            for x in range(2, 14):
                d = math.hypot(x + 0.5 - cx, y + 0.5 - 7.5)
                ang = math.atan2(y + 0.5 - 7.5, x + 0.5 - cx) - sign * turn
                tooth = (ang * 8 / (2 * math.pi)) % 1 < 0.5
                if d <= 2.6 or (d <= 3.4 and tooth):
                    p[x, y] = hexc('#b4bcc6' if x + y < cx + 7 else '#8a929e' if d < 2 else '#5a616c')
    return im


@tile
def hazard(f, on):
    return fill(blank(), lambda x, y: '#f2c21a' if ((x + y) // 3) % 2 == 0 else '#1e1e20')


@tile
def hopper_top(f, on):
    def c(x, y):
        if x in (0, 15) or y in (0, 15):
            return '#2b2f36'
        if 3 <= x <= 12 and 3 <= y <= 12:
            if on and 5 <= x <= 10 and 5 <= y <= 10 and (x * 7 + y * 3 + f * 5) % 9 < 3:
                return '#c86a34' if (x + y + f) % 2 else '#b8bec6'
            return '#0e0f12'
        return '#8a929e' if x + y < 15 else '#4a505a'
    return fill(blank(), c)


@tile
def planks(f, on):
    def c(x, y):
        if y % 4 == 3:
            return '#3e2a18'
        return '#9a7048' if y % 4 == 0 else '#7a5634' if noise(x, y // 4, 5) > 0.2 else '#6b4a2c'
    return fill(blank(), c)


@tile
def log(f, on):
    return fill(blank(), lambda x, y: '#3e2a18' if x in (0, 15) else '#5a3d24' if x % 5 == 2 else '#6b4a2c')


@tile
def blade(f, on):
    turn = f * (math.pi / 10) if on else 0
    def c(x, y):
        d = math.hypot(x + 0.5 - 8, y + 0.5 - 8)
        ang = math.atan2(y + 0.5 - 8, x + 0.5 - 8) + turn
        if d <= 1.2:
            return '#3a3f47'
        if d <= 6:
            return '#e4e8ec' if (ang % (math.pi / 2)) < math.pi / 4 else '#b8bec6'
        if d <= 7.6 and (ang * 12 / (2 * math.pi)) % 1 < 0.55:
            return '#c8ccd2'
        return None
    return fill(blank(), c)


@tile
def bench_top(f, on):
    im = fill(blank(), lambda x, y: '#3e2a18' if x in (0, 15) or y in (0, 15) else '#c9a066' if noise(x, y, 6) > 0.2 else '#b48c58')
    p = im.load()
    for x in range(3, 13):
        p[x, 7] = hexc('#2b2f36')
    return im


@tile
def blueprint(f, on):
    def c(x, y):
        if x in (0, 15) or y in (0, 15):
            return '#1c2a50'
        if x in (1, 14) or y in (1, 14):
            return '#e8f0ff'
        if (x, y) in ((4, 4), (11, 4)):
            return '#c03030'
        line = (y == 6 and 4 <= x <= 11) or (x == 5 and 6 <= y <= 11) or (x == 10 and 6 <= y <= 11) or (y == 11 and 5 <= x <= 10) or (x == 7 and 8 <= y <= 9)
        return '#e8f0ff' if line else '#3d6fd0' if (x + y) % 4 else '#4a7ee0'
    return fill(blank(), c)


@tile
def awning(f, on):
    return fill(blank(), lambda x, y: ('#d83a2c' if (x // 4) % 2 == 0 else '#f2ece0') if y < 14 else '#7a1c14')


@tile
def goods(f, on):
    im = planks(f, on)
    p = im.load()
    spots = {(3, 3): '#ffd23c', (4, 3): '#ffe877', (3, 4): '#d99a1c', (4, 4): '#ffd23c', (11, 4): '#ff5a6e', (12, 4): '#d81e3c',
             (11, 5): '#8c0f24', (7, 9): '#8ff0ff', (8, 9): '#3cc8e6', (7, 10): '#1a7ea8', (8, 10): '#3cc8e6',
             (3, 11): '#e4e8ec', (4, 11): '#b8bec6', (5, 11): '#b8bec6', (12, 11): '#f0965a', (13, 11): '#c86a34', (12, 12): '#8a3c1c'}
    for (x, y), col in spots.items():
        p[x, y] = hexc(col)
    return im


@tile
def rail(f, on):
    def c(x, y):
        if x in (3, 12):
            return '#9aa3b0'
        if y % 4 == 1 and 1 <= x <= 14:
            return '#6b4a2c'
        return None
    return fill(blank(), c)


@tile
def cart_side(f, on):
    def c(x, y):
        if y in (0, 15) or x in (0, 15):
            return '#2b2f36'
        if y in (1, 2):
            return '#9aa3b0'
        if (x, y) in ((2, 4), (13, 4), (2, 12), (13, 12)):
            return '#c8ccd2'
        return '#5a616c' if noise(x, y, 7) > 0.2 else '#505762'
    return fill(blank(), c)


@tile
def cart_top(f, on):
    cols = ['#ffd23c', '#c86a34', '#e4e8ec', '#3cc8e6', '#d81e3c', '#2e2a2c']
    def c(x, y):
        if x in (0, 15) or y in (0, 15):
            return '#2b2f36'
        if x in (1, 14) or y in (1, 14):
            return '#9aa3b0'
        n = int(noise(x // 2, y // 2, 8) * 97) % 9
        return cols[n] if n < len(cols) else '#6e5c48'
    return fill(blank(), c)


@tile
def leather(f, on):
    def c(x, y):
        if x in (0, 15) or y in (0, 15):
            return '#3a2010'
        if y == 5:
            return '#2a1408'
        if x == 7 and 6 <= y <= 9:
            return '#ffd23c'
        return '#8f5a26' if noise(x, y, 9) > 0.25 else '#7a4c20'
    return fill(blank(), c)


@tile
def lantern(f, on):
    glow = ['#ffe38a', '#fff3b0', '#ffd060', '#fff0a0'][f] if on else '#ffe38a'
    def c(x, y):
        if x in (0, 15) or y in (0, 15):
            return '#1a1410'
        if x in (1, 14) or y in (1, 2, 13, 14):
            return '#3c3f4a'
        return glow if 5 <= x <= 10 and 5 <= y <= 10 else '#ffc844'
    return fill(blank(), c)


@tile
def pick_head(f, on):
    return fill(blank(), lambda x, y: '#1a7ea8' if y > 11 else '#8ff0ff' if y < 4 else '#3cc8e6')


@tile
def anvil_top(f, on):
    return fill(blank(), lambda x, y: '#2b2f36' if x in (0, 15) or y in (0, 15) else '#7a828e' if y < 3 else '#5a616c' if noise(x, y, 10) > 0.15 else '#4f5661')


@tile
def ruby(f, on):
    return fill(blank(), lambda x, y: '#ffd6de' if x + y < 6 else '#ff5a6e' if x < 8 else '#d81e3c' if x < 13 else '#8c0f24')


@tile
def wheel(f, on):
    return fill(blank(), lambda x, y: '#1a1a1e' if x in (0, 15) or y in (0, 15) else '#3a3d44' if (x + y) % 5 else '#5a5e66')


@tile
def counter(f, on):
    im = planks(f, on)
    p = im.load()
    for y in range(4, 12):
        for x in range(4, 12):
            d = math.hypot(x + 0.5 - 8, y + 0.5 - 8)
            if d <= 3.6:
                p[x, y] = hexc('#5a3a08' if d > 3 else '#fff2a0' if x + y < 14 else '#ffd23c' if x + y < 18 else '#d99a1c')
    return im


@tile
def crate(f, on):
    def c(x, y):
        if x in (0, 15) or y in (0, 15):
            return '#3e2a18'
        if x in (1, 14) or y in (1, 14) or x == y or x == 15 - y:
            return '#6b4a2c'
        return '#9a7048'
    return fill(blank(), c)


@tile
def copper(f, on):
    return fill(blank(), lambda x, y: '#ffd2ae' if x < 4 else '#e8874a' if x < 10 else '#a85428')


@tile
def iron(f, on):
    return fill(blank(), lambda x, y: '#2b2f36' if x in (0, 15) or y in (0, 15) else '#8a929e' if noise(x, y, 11) > 0.2 else '#7a828e')


@tile
def gold(f, on):
    return fill(blank(), lambda x, y: '#fff6b0' if x + y < 8 else '#ffd83a' if x + y < 20 else '#d99a1c')


@tile
def drawer(f, on):
    im = planks(f, on)
    p = im.load()
    for y in range(4, 12):
        for x in range(2, 14):
            p[x, y] = hexc('#3e2a18' if x in (2, 13) or y in (4, 11) else '#8a6238')
    p[7, 7] = p[8, 7] = hexc('#ffd23c')
    return im


TILE_NAMES = list(TILES)
assert len(TILE_NAMES) <= 64
COLS = 8
ATLAS = 16 * COLS


def atlas(on):
    frames = FRAMES if on else 1
    im = Image.new('RGBA', (ATLAS, ATLAS * frames), (0, 0, 0, 0))
    for f in range(frames):
        for i, name in enumerate(TILE_NAMES):
            im.alpha_composite(TILES[name](f, on), ((i % COLS) * 16, f * ATLAS + (i // COLS) * 16))
    return im


# ---- models -------------------------------------------------------------------------------------------------------
FACE_SIZE = {'north': (0, 1), 'south': (0, 1), 'east': (2, 1), 'west': (2, 1), 'up': (0, 2), 'down': (0, 2)}
# Tiles that are pictures (a furnace mouth, a blade...): drawn whole on any face size. Other tiles are materials:
# cropped, so their texels stay the same size everywhere.
PICTURES = {'furnace_front', 'crusher_front', 'blade', 'counter', 'drawer', 'blueprint', 'leather', 'lantern', 'cart_top', 'goods', 'hopper_top', 'bench_top', 'anvil_top', 'rail'}


def cube(origin, size, tile_name, **faces):
    """faces: per-face tile overrides; a face set to None is not drawn."""
    uv = {}
    for face, (a, b) in FACE_SIZE.items():
        t = faces.get(face, tile_name)
        if t is None:
            continue
        i = TILE_NAMES.index(t)
        w, h = (16, 16) if t in PICTURES else (min(16, size[a]), min(16, size[b]))
        u0, v0 = (i % COLS) * 16 + (16 - w) // 2, (i // COLS) * 16 + (16 - h) // 2
        uv[face] = {'uv': [u0, v0], 'uv_size': [w, h]}
    return {'origin': origin, 'size': size, 'uv': uv}


def legs(tile_name, h, inset=7, w=2):
    return [cube([x, 0, z], [w, h, w], tile_name) for x in (-inset, inset - w) for z in (-inset, inset - w)]


MODELS = {
    'smelter': [
        cube([-7, 0, -6], [14, 11, 13], 'brick', north='furnace_front'),
        cube([-8, 11, -7], [16, 2, 15], 'brick_dark'),
        cube([1, 13, 1], [5, 5, 5], 'brick_dark'),
        cube([-6, 1, 7], [3, 10, 1], 'copper'),
    ],
    'crusher': [
        cube([-7, 0, -7], [14, 7, 14], 'steel', north='crusher_front', up='steel_dark'),
        cube([-6, 7, -6], [12, 3, 12], 'steel_dark', north='hazard', south='hazard', east='hazard', west='hazard'),
        cube([-8, 10, -8], [16, 5, 16], 'steel', up='hopper_top'),
    ],
    'gem_cutter': [
        *legs('log', 9),
        cube([-7, 2, -7], [14, 7, 1], 'drawer', south=None, up=None, down=None),
        cube([-8, 9, -8], [16, 3, 16], 'planks', up='bench_top'),
        cube([-0.5, 12, -5], [1, 9, 9], 'blade', north=None, south=None, up=None, down=None),
        cube([3, 12, 2], [3, 2, 3], 'ruby'),
    ],
    'machine_frame': [
        *legs('log', 16, inset=8),
        cube([-8, 14, -8], [16, 2, 2], 'log'), cube([-8, 14, 6], [16, 2, 2], 'log'),
        cube([-8, 14, -6], [2, 2, 12], 'log'), cube([6, 14, -6], [2, 2, 12], 'log'),
        cube([-5, 0, -1], [10, 2, 3], 'planks'),
        cube([-5, 2, 0], [10, 10, 1], 'blueprint', south='planks', east=None, west=None, up=None, down=None),
    ],
    'pick_station': [
        cube([-6, 0, -5], [12, 3, 10], 'iron'),
        cube([-3, 3, -3], [6, 5, 6], 'steel_dark'),
        cube([-8, 8, -5], [16, 4, 10], 'iron', up='anvil_top'),
        cube([-6, 12, -3], [12, 2, 2], 'pick_head'),
        cube([-1, 12, -1], [2, 1, 7], 'log'),
        cube([5, 12, 1], [2, 2, 2], 'gold'),
    ],
    'gear_bench': [
        *legs('log', 9),
        cube([-8, 9, -8], [16, 3, 16], 'planks', north='drawer', up='bench_top'),
        cube([-6, 12, -3], [5, 7, 5], 'lantern'),
        cube([1, 12, -2], [6, 7, 5], 'leather'),
    ],
    'cart_depot': [
        cube([-8, 0, -8], [16, 1, 16], 'planks', up='rail'),
        *[cube([x, 1, z], [3, 3, 3], 'wheel') for x in (-7, 4) for z in (-5, 2)],
        cube([-7, 3, -6], [14, 9, 12], 'cart_side', up='cart_top'),
    ],
    'trader': [
        cube([-8, 0, -8], [16, 9, 16], 'crate', north='counter', south='counter', east='counter', west='counter'),
        cube([-8, 9, -8], [16, 1, 16], 'planks', up='goods'),
        *[cube([x, 10, z], [2, 13, 2], 'log') for x in (-8, 6) for z in (-8, 6)],
        cube([-10, 23, -10], [20, 2, 20], 'awning'),
    ],
}
# Machines: a still block and a working one ("_on", animated). Other models use the still atlas only.
MACHINES = {'smelter', 'crusher', 'gem_cutter'}
NAMES = {'smelter': 'Smelter', 'crusher': 'Crusher', 'gem_cutter': 'Gem Cutter', 'machine_frame': 'Machine Bay',
         'pick_station': 'Pickaxe Station', 'gear_bench': 'Gear Bench', 'cart_depot': 'Mine Cart', 'trader': 'Ore Trader'}
LIGHT = {'smelter_on': 11, 'crusher_on': 3, 'gem_cutter_on': 3, 'gear_bench': 9, 'trader': 6}
SOUND = {'smelter': 'stone', 'crusher': 'metal', 'gem_cutter': 'wood', 'machine_frame': 'wood', 'pick_station': 'metal',
         'gear_bench': 'wood', 'cart_depot': 'metal', 'trader': 'wood'}
COLOR = {'smelter': '#5a5650', 'crusher': '#6e7682', 'gem_cutter': '#7a5634', 'machine_frame': '#8a6a44', 'pick_station': '#7a828e',
         'gear_bench': '#7a5634', 'cart_depot': '#5a616c', 'trader': '#d83a2c'}


def geometry(name, cubes):
    return {'format_version': '1.12.0', 'minecraft:geometry': [{
        'description': {'identifier': f'geometry.{NS}.{name}', 'texture_width': ATLAS, 'texture_height': ATLAS,
                        'visible_bounds_width': 3, 'visible_bounds_height': 3, 'visible_bounds_offset': [0, 1, 0]},
        'bones': [{'name': 'body', 'pivot': [0, 0, 0], 'cubes': cubes}]}]}


def block(name, model, on):
    ident = f'{NS}:{name}'
    comps = {
        'minecraft:display_name': f'tile.{NS}:{model}.name',
        'minecraft:geometry': f'geometry.{NS}.{model}',
        'minecraft:material_instances': {'*': {'texture': f'{NS}_props{"_on" if on else ""}', 'render_method': 'alpha_test'}},
        'minecraft:collision_box': {'origin': [-8, 0, -8], 'size': [16, 16, 16]},
        'minecraft:selection_box': {'origin': [-8, 0, -8], 'size': [16, 16, 16]},
        'minecraft:light_dampening': 0,
        'minecraft:destructible_by_mining': False,
        'minecraft:destructible_by_explosion': False,
        'minecraft:map_color': COLOR[model],
    }
    if LIGHT.get(name):
        comps['minecraft:light_emission'] = LIGHT[name]
    return {'format_version': '1.21.60', 'minecraft:block': {
        'description': {'identifier': ident, 'menu_category': {'category': 'construction'}}, 'components': comps}}


ICON_TILE = {'pick_station': 'pick_head', 'gear_bench': 'lantern', 'cart_depot': 'cart_top', 'machine_frame': 'blueprint', 'trader': 'counter'}


def icon(model):
    """A 16x16 menu icon: the tile that shows what the model is."""
    return TILES[ICON_TILE[model]](0, False)


def main():
    (RP / 'models/blocks').mkdir(parents=True, exist_ok=True)
    atlas(False).save(TEX / 'props.png')
    atlas(True).save(TEX / 'props_on.png')
    blocks_json = json.loads((RP / 'blocks.json').read_text())
    terrain = json.loads((RP / 'textures/terrain_texture.json').read_text())
    terrain['texture_data'][f'{NS}_props'] = {'textures': f'textures/{NS}/blocks/props'}
    terrain['texture_data'][f'{NS}_props_on'] = {'textures': f'textures/{NS}/blocks/props_on'}
    lang_path = RP / 'texts/en_US.lang'
    lang = lang_path.read_text().splitlines()
    for model, cubes in MODELS.items():
        (RP / f'models/blocks/{model}.geo.json').write_text(json.dumps(geometry(model, cubes), indent=2) + '\n')
        variants = [(model, False)] + ([(f'{model}_on', True)] if model in MACHINES else [])
        for name, on in variants:
            (BP / f'blocks/{name}.json').write_text(json.dumps(block(name, model, on), indent=2) + '\n')
            blocks_json[f'{NS}:{name}'] = {'sound': SOUND[model]}
        key = f'tile.{NS}:{model}.name='
        if not any(line.startswith(key) for line in lang):
            lang.append(key + NAMES[model])
        if model not in MACHINES:  # machines keep their painted front as icon
            icon(model).save(TEX / f'{model}_front.png')
    (RP / 'blocks.json').write_text(json.dumps(blocks_json, indent=2) + '\n')
    (RP / 'textures/terrain_texture.json').write_text(json.dumps(terrain, indent=2) + '\n')
    lang_path.write_text('\n'.join(lang) + '\n')
    (RP / 'textures/flipbook_textures.json').write_text(json.dumps([
        {'flipbook_texture': f'textures/{NS}/blocks/props_on', 'atlas_tile': f'{NS}_props_on', 'ticks_per_frame': 3}], indent=2) + '\n')
    print('models:', ', '.join(MODELS), '| tiles:', len(TILE_NAMES))


if __name__ == '__main__':
    main()
