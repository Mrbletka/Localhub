# Generates the studio HUD: RP/ui/hud_screen.json and its art (the MINE-OS board, light bar, progress bar, icons, the
# notification card).
# Run after changing the HUD:  python3 projects/mining-tycoon/tools/gen_hud.py
#
# How it works: BP/scripts/hud.js puts what the HUD shows in the title text behind an invisible prefix (formatting
# codes) and keeps such a title up all the time. The game's title control (hud_title_text) is replaced by our board,
# which reads the title text (a global UI binding), so no title is ever shown as a title.
# - home: "§h§u§1" + one mark "§q§q§<1-9a>" per lit progress segment + lines (money, quest or goal, progress)
# - run:  "§h§u§2" + one mark per lit light segment + lines (time, haul, cave level)
# - "§d§o§r" in front of either, for a moment on arrival: the MINE-OS blast doors (tools/transit.py) stand shut
#   over the world and slide apart (the loading screen closed them)
# - the subtitle carries the profile (top-right panel): "§p§f§1" + rank "§z§z§<1-7>" + one mark per lit XP segment +
#   lines (name; rank, level, XP)
# Notifications (hud.js notify/toast) use the action bar: its control (hud_actionbar_text) becomes a MINE-OS card above
# the hotbar that slides up with a flicker, pings, sweeps a light streak over the glass, wipes its text in and drains
# a timer line before it fades.
#
# Every visibility test has the one form that is reliable in the HUD on the phone: "contains" = (not ((#s - 'code') =
# #s)). The negated form ((#s - 'code') = #s) and compound tests (not (A or B)) came out true when they should not
# (a plain-title fallback showed the HUD text big in the middle), so the HUD never needs "does not contain".
#
# The board may be rebuilt with every new title (every second in a cave): its loops last a second (coin, radar, LED)
# so a restart doesn't show, and the slow effects (scan beam, sheen) wait over a second before they first play.
import json
import math
import pathlib
from PIL import Image

from transit import door_controls

PROJECT = pathlib.Path(__file__).resolve().parent.parent
RP = PROJECT / 'RP'
UI = 'textures/mining_tycoon/ui'
TECH = f'{UI}/tech'
ART = RP / UI
HOME, RUN, PROFILE, DOORS = '§h§u§1', '§h§u§2', '§p§f§1', '§d§o§r'
RANKS = ['pick_1', 'pick_2', 'pick_3', 'pick_4', 'pick_5', 'pick_6', 'cut_diamond']  # badge per rank (config.js profile.ranks)
rank_code = lambda n: f'§z§z§{n}'
LEVELS = '0123456789a'
mark = lambda n: f'§q§q§{LEVELS[n]}'
MARKS = [mark(n) for n in range(11)]

# ---- art ----------------------------------------------------------------------------------------------------------
GOLD_HI, GOLD, GOLD_LO, OUTLINE = '#ffe08a', '#d9a640', '#8a6420', '#120d08'
CYAN = (95, 246, 255)  # MINE-OS light
CYAN_TEXT = [0.55, 0.97, 1.0]
CYAN_DIM = [0.32, 0.62, 0.68]


def hexc(h, a=255):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (a,)


def paint(size, fn):
    im = Image.new('RGBA', size, (0, 0, 0, 0))
    p = im.load()
    for y in range(size[1]):
        for x in range(size[0]):
            c = fn(x, y)
            if c:
                p[x, y] = c if isinstance(c, tuple) else hexc(c)
    return im


def glass(fill_alpha):
    """16x16 nine-slice: dark cyan glass, chamfered corners with bright corner ticks, a thin cyan rim. Nearly solid:
    the game's Interface Opacity setting makes the whole HUD more see-through on top of this."""
    def c(x, y):
        cx, cy = min(x, 15 - x), min(y, 15 - y)
        if cx + cy < 2:
            return None  # the chamfer
        if cx + cy == 2 or (cx + cy == 3 and min(cx, cy) == 0):
            return CYAN + (255,)  # corner ticks
        if cx == 0 or cy == 0:
            return CYAN + (245 if y == 0 else 190,)
        if y == 1:
            return (40, 120, 140, min(255, fill_alpha + 10))  # glass highlight under the top rim
        return (6, 22, 30, fill_alpha) if y < 8 else (4, 15, 22, min(255, fill_alpha + 6))
    return paint((16, 16), c)


def strip_of(frames):
    out = Image.new('RGBA', (sum(f.width for f in frames), frames[0].height))
    x = 0
    for f in frames:
        out.paste(f, (x, 0))
        x += f.width
    return out


def coin_frame(k, n=8):
    """10x10 gold coin turning around its upright axis (frame k of n)."""
    cos = math.cos(2 * math.pi * k / n)
    half = max(0.6, 4.5 * abs(cos))
    face = GOLD if cos >= 0 else '#c08a2e'

    def c(x, y):
        dx, dy = (x - 4.5) / half, (y - 4.5) / 4.6
        d = dx * dx + dy * dy
        if d > 1:
            return None
        if half < 1.5:
            return '#b8862c'  # edge on
        if d > 0.55:
            return GOLD_LO if x > 4.5 or y > 5 else '#b8862c'
        if x < 4.5 - half * 0.2 and y < 4:
            return GOLD_HI
        return face
    return paint((10, 10), c)


def radar_frame(k, n=8):
    """9x9 mini radar: a ring, a sweeping line with a fading trail, a blip lit as the sweep passes."""
    def c(x, y):
        dx, dy = x - 4, y - 4
        r = math.hypot(dx, dy)
        if r > 4.4:
            return None
        if r >= 3.6:
            return CYAN + (150,)
        if r < 0.5:
            return CYAN + (255,)
        a = math.atan2(dy, dx) % (2 * math.pi)
        sweep = 2 * math.pi * k / n
        behind = (sweep - a) % (2 * math.pi)
        if behind < 0.45:
            return (210, 255, 255, 255)
        if behind < 1.3:
            return CYAN + (int(150 * (1 - behind / 1.3)) + 30,)
        if (x, y) == (6, 2):
            return (120, 255, 140, 255 if k in (1, 2) else 120 if k == 3 else 60)  # blip
        return (8, 40, 50, 120)
    return paint((9, 9), c)


def icon_target():
    rows = ['....CC....',
            '...C..C...',
            '..C....C..',
            '.C..ww..C.',
            'C..wWWw..C',
            'C..wWWw..C',
            '.C..ww..C.',
            '..C....C..',
            '...C..C...',
            '....CC....']
    pal = {'C': CYAN + (255,), 'w': (120, 230, 240, 255), 'W': (255, 255, 255, 255)}
    return paint((10, 10), lambda x, y: pal.get(rows[y][x]))


def icon_notify():
    rows = ['.....kk.....',
            '....kCCk....',
            '...kCccCk...',
            '..kCcwwcCk..',
            '.kCccwwccCk.',
            'kCcccwwcccCk',
            'kCcccwwcccCk',
            '.kCccccccCk.',
            '..kCcwwcCk..',
            '...kCccCk...',
            '....kCCk....',
            '.....kk.....']
    pal = {'k': '#03141c', 'C': '#5ff6ff', 'c': '#0e5a66', 'w': '#ffffff'}
    return paint((12, 12), lambda x, y: pal.get(rows[y][x]))


def ring():
    return paint((16, 16), lambda x, y: CYAN + (255,) if 5.9 <= ((x - 7.5) ** 2 + (y - 7.5) ** 2) ** 0.5 < 7.1 else None)


def bar(size, colors):
    top, mid, low = colors
    w, h = size
    return paint(size, lambda x, y: hexc(top) if y < h // 4 else hexc(mid) if y < h - h // 4 else hexc(low))


def led(core, edge):
    return paint((3, 3), lambda x, y: hexc(core) if (x, y) == (1, 1) else hexc(edge, 200) if x == 1 or y == 1 else hexc(edge, 90))


def avatar_frame(w=24, h=32):
    """Portrait holo frame for the player model: dark glass, a faint grid, chamfered cyan rim with bright corners."""
    def c(x, y):
        cx, cy = min(x, w - 1 - x), min(y, h - 1 - y)
        if cx + cy < 2:
            return None
        if cx + cy == 2 or (cx + cy <= 4 and min(cx, cy) == 0):
            return CYAN + (255,)
        if cx == 0 or cy == 0:
            return CYAN + (190,)
        if x % 5 == 2 or y % 5 == 2:
            return (16, 66, 80, 238)
        glow = max(0, 1 - math.hypot(x - (w - 1) / 2, y - h * 0.55) / (h * 0.55))
        return (6 + int(20 * glow), 22 + int(40 * glow), 30 + int(45 * glow), 240)
    return paint((w, h), c)


def write_art():
    glass(242).save(ART / 'hud_board.png')
    glass(250).save(ART / 'hud_note.png')
    for name in ('hud_board', 'hud_note'):
        (ART / f'{name}.json').write_text(json.dumps({'nineslice_size': 4, 'base_size': [16, 16]}, indent=2) + '\n')
    paint((2, 16), lambda x, y: GOLD_HI if y < 5 else GOLD if y < 11 else GOLD_LO).save(ART / 'hud_note_accent.png')
    paint((4, 1), lambda x, y: CYAN + (230,)).save(ART / 'hud_note_timer.png')
    paint((4, 4), lambda x, y: (210, 255, 255, 255)).save(ART / 'hud_note_flash.png')
    ring().save(ART / 'hud_note_ping.png')
    icon_notify().save(ART / 'icons/notify.png')
    # the board
    strip_of([coin_frame(k) for k in range(8)]).save(ART / 'hud_coin.png')
    strip_of([radar_frame(k) for k in range(8)]).save(ART / 'hud_radar.png')
    icon_target().save(ART / 'icons/target.png')
    led('#c8ffc0', '#2bd12b').save(ART / 'hud_led.png')
    led('#ffd0c8', '#e02a2a').save(ART / 'hud_led_red.png')
    paint((16, 3), lambda x, y: (200, 255, 255, 170) if y == 1 else CYAN + (45,)).save(ART / 'hud_beam.png')
    bar((6, 4), ('#d8feff', '#5ff6ff', '#1a9fb0')).save(ART / 'hud_prog_on.png')
    bar((6, 4), ('#fff3b0', '#ffc844', '#c47a12')).save(ART / 'hud_xp_on.png')
    avatar_frame().save(ART / 'hud_avatar.png')
    paint((6, 4), lambda x, y: CYAN + (80,) if x in (0, 5) or y in (0, 3) else (6, 30, 40, 200)).save(ART / 'hud_prog_off.png')
    bar((4, 8), ('#d8feff', '#5ff6ff', '#1a9fb0')).save(ART / 'hud_seg_on.png')
    bar((4, 8), ('#ffb08a', '#ff5a3a', '#b02a1a')).save(ART / 'hud_seg_low.png')
    paint((4, 8), lambda x, y: CYAN + (70,) if x in (0, 3) or y in (0, 7) else (6, 30, 40, 210)).save(ART / 'hud_seg_off.png')


# ---- hud_screen.json ----------------------------------------------------------------------------------------------
ui = {'namespace': 'hud'}
GLOBAL_TITLE = {'binding_name': '#hud_title_text_string'}
TITLE = '#hud_title_text_string'
GLOBAL_SUB = {'binding_name': '#hud_subtitle_text_string'}
SUB = '#hud_subtitle_text_string'


def view(expr, target='#visible'):
    return {'binding_type': 'view', 'source_property_name': expr, 'target_property_name': target}


def has(prop, s):
    return f"(not (({prop} - '{s}') = {prop}))"


def strip(prop, *codes):
    return '(' + prop + ''.join(f" - '{c}'" for c in codes) + ')'


def label(text_expr, prop_binding, **extra):
    d = {'type': 'label', 'text': '#text', 'color': [1, 1, 1], 'shadow': True, 'size': ['default', 'default'],
         'max_size': [180, 80], 'layer': 3, 'bindings': [prop_binding, view(text_expr, '#text')]}
    d.update(extra)
    return d


def image(texture, size, **extra):
    d = {'type': 'image', 'texture': texture, 'size': size, 'layer': 2}
    d.update(extra)
    return d


def tech_text(text, color=CYAN_TEXT, **extra):
    d = {'type': 'label', 'text': text, 'color': color, 'shadow': False, 'font_scale_factor': 0.8, 'layer': 4,
         'size': ['default', 'default'], 'localize': False}
    d.update(extra)
    return d


def gap(w, h):
    return {'type': 'panel', 'size': [w, h]}


def anim(name, kind, duration, frm, to, nxt=None, easing='linear', **extra):
    d = {'anim_type': kind, 'easing': easing, 'duration': duration, 'from': frm, 'to': to}
    if nxt:
        d['next'] = f'@hud.{nxt}'
    d.update(extra)
    ui[name] = d
    return f'@hud.{name}'


def seq(prefix, kind, steps, **last):
    """One-shot steps [(duration, from, to, easing?)], each starting the next; the last value stays."""
    names = [f'mining_tycoon_note_{prefix}_{i}' for i in range(len(steps))]
    for i, (dur, frm, to, *ease) in enumerate(steps):
        end = i + 1 == len(steps)
        anim(names[i], kind, dur, frm, to, None if end else names[i + 1], ease[0] if ease else 'linear', **(last if end else {}))
    return f'@hud.{names[0]}'


def loop(prefix, kind, steps):
    names = [f'mining_tycoon_note_{prefix}_{i}' for i in range(len(steps))]
    for i, (dur, frm, to, *ease) in enumerate(steps):
        anim(names[i], kind, dur, frm, to, names[(i + 1) % len(steps)], ease[0] if ease else 'linear')
    return f'@hud.{names[0]}'


def flip(name, frames, step, fps):
    ui[name] = {'anim_type': 'flip_book', 'initial_uv': [0, 0], 'frame_count': frames, 'frame_step': step, 'fps': fps,
                'next': f'@hud.{name}'}
    return f'@hud.{name}'


ICON = 10  # icon size in the HUD
LINE = 10  # label line height
COIN = flip('mining_tycoon_hud_coin', 8, 10, 8)  # one turn a second
RADAR = flip('mining_tycoon_hud_radar', 8, 9, 8)
BLINK = loop('hud_led', 'alpha', [(0.5, 1, 1), (0.5, 0.2, 0.2)])
BEAM = loop('hud_beam', 'offset', [(1.4, [0, -4], [0, -4]), (0.9, [0, -4], [0, '100%'], 'in_out_sine'), (2.6, [0, '100%'], [0, '100%'])])
SHEEN = loop('hud_sheen', 'offset', [(2.2, [-30, 0], [-30, 0]), (0.8, [-30, 0], ['100%', 0], 'in_out_sine'), (3.4, ['100%', 0], ['100%', 0])])


def header(mode):
    """MINE-OS // MODE, with room on the right for the radar and the status LED (drawn by the frame)."""
    return {'header': {'type': 'stack_panel', 'orientation': 'horizontal', 'size': ['100%c', 8], 'controls': [
        {'tag': tech_text('MINE-OS')},
        {'gap': gap(4, 1)},
        {'mode': tech_text(f'// {mode}', CYAN_DIM)},
        {'room': gap(24, 1)},
    ]}}


def board(code, mode, led_texture, content, side='left', prop=TITLE, binding=GLOBAL_TITLE):
    """A MINE-OS glass board in a top corner (below the hearts / hunger phones show there): sized by its content,
    with a frame of effects as big as the board (the frame's only sibling is the content, so '100%sm' is the board's
    size). Shown while the title (or subtitle) text has the board's code."""
    body = {'type': 'panel', 'size': ['100%c + 13px', '100%c + 9px'], 'controls': [
        {'col': {'type': 'stack_panel', 'orientation': 'vertical', 'size': ['100%cm', '100%c'], 'layer': 3,
                 'anchor_from': 'top_left', 'anchor_to': 'top_left', 'offset': [8, 4], 'controls': [
            header(mode), {'rule_gap': gap(1, 5)}, *content]}},
    ]}
    frame = {'type': 'panel', 'size': ['100%sm', '100%sm'], 'controls': [
        {'scan': image(f'{TECH}/scanlines', ['100% - 2px', '100% - 2px'], tiled=True, layer=1)},
        {'accent': image(f'{UI}/hud_note_accent', [2, '100% - 8px'], keep_ratio=False, layer=2,
                         anchor_from='left_middle', anchor_to='left_middle', offset=[3, 0])},
        {'rule': image(f'{TECH}/line', ['100% - 12px', 1], keep_ratio=False, layer=2, alpha=0.75,
                       anchor_from='top_left', anchor_to='top_left', offset=[7, 14])},
        {'radar': image(f'{UI}/hud_radar', [9, 9], uv_size=[9, 9], uv=RADAR, layer=4, disable_anim_fast_forward=True,
                        anchor_from='top_right', anchor_to='top_right', offset=[-10, 3])},
        {'led': image(f'{UI}/{led_texture}', [3, 3], layer=4, alpha=BLINK, anchor_from='top_right', anchor_to='top_right', offset=[-4, 6])},
        {'glass': {'type': 'panel', 'size': ['100% - 2px', '100% - 2px'], 'clips_children': True, 'layer': 5, 'controls': [
            {'beam': image(f'{UI}/hud_beam', ['100%', 3], keep_ratio=False, alpha=0.55, anchor_from='top_middle',
                           anchor_to='top_middle', offset=BEAM)},
            {'sheen': image(f'{TECH}/streak', [26, '100%'], keep_ratio=False, alpha=0.8, anchor_from='left_middle',
                            anchor_to='left_middle', offset=SHEEN)},
        ]}},
    ]}
    return {
        'type': 'image', 'texture': f'{UI}/hud_board', 'size': ['100%cm', '100%cm'], 'layer': 1,
        'anchor_from': f'top_{side}', 'anchor_to': f'top_{side}', 'offset': [4 if side == 'left' else -4, 22],
        'bindings': [binding, view(has(prop, code))],
        'controls': [{'body': body}, {'frame': frame}],
    }


def segments(prefix, on, off, size, low=0, low_texture=None, prop=TITLE, binding=GLOBAL_TITLE):
    """10 segments: an empty one, and over it the lit one when its own mark is in the title (or subtitle)."""
    w, h = size
    out = []
    for k in range(1, 11):
        tex = low_texture if k <= low else on
        out.append({f'{prefix}_{k}': {'type': 'panel', 'size': [w + 1, h], 'controls': [
            {'off': image(f'{UI}/{off}', [w, h], keep_ratio=False, anchor_from='left_middle', anchor_to='left_middle')},
            {'on': image(f'{UI}/{tex}', [w, h], keep_ratio=False, layer=3, anchor_from='left_middle', anchor_to='left_middle',
                         bindings=[binding, view(has(prop, mark(k)))])},
        ]}})
    return out


home = board(HOME, 'MINE CONTROL', 'hud_led', [
    {'row': {'type': 'stack_panel', 'orientation': 'horizontal', 'size': ['100%c', '100%cm'], 'controls': [
        {'icons': {'type': 'stack_panel', 'orientation': 'vertical', 'size': [ICON, '100%c'], 'controls': [
            {'coin': image(f'{UI}/hud_coin', [ICON, LINE], uv_size=[10, 10], uv=COIN, disable_anim_fast_forward=True)},
            {'goal': image(f'{UI}/icons/target', [ICON, LINE])},
        ]}},
        {'gap': gap(4, 1)},
        {'text': label(strip(TITLE, DOORS, HOME, *MARKS), GLOBAL_TITLE)},
    ]}},
    {'bar_gap': gap(1, 3)},
    {'progress': {'type': 'stack_panel', 'orientation': 'horizontal', 'size': ['100%c', 4], 'controls': [
        {'indent': gap(14, 1)},
        *segments('p', 'hud_prog_on', 'hud_prog_off', (6, 4)),
    ]}},
])

run = board(RUN, 'EXPEDITION', 'hud_led_red', [
    {'light': {'type': 'stack_panel', 'orientation': 'horizontal', 'size': ['100%c', 10], 'controls': [
        {'lantern': image(f'{UI}/icons/expedition', [ICON, ICON])},
        {'gap': gap(4, 1)},
        {'bar': {'type': 'stack_panel', 'orientation': 'horizontal', 'size': ['100%c', 8], 'offset': [0, 1],
                 'controls': segments('seg', 'hud_seg_on', 'hud_seg_off', (4, 8), low=3, low_texture='hud_seg_low')}},
    ]}},
    {'row_gap': gap(1, 3)},
    {'haul': {'type': 'stack_panel', 'orientation': 'horizontal', 'size': ['100%c', '100%cm'], 'controls': [
        {'pack': image(f'{UI}/icons/backpack', [ICON, ICON])},
        {'gap': gap(4, 1)},
        {'text': label(strip(TITLE, DOORS, RUN, *MARKS), GLOBAL_TITLE)},
    ]}},
])

# The profile: the player's own model (the game's paper doll renderer, without its "only while sprinting" binding)
# in a portrait holo frame with the rank badge, then name / rank, level, XP and a gold XP bar.
# The renderer draws the whole body about 1.7x as tall as its control, from the control's top edge (seen on the
# phone: a 24 px control gave a 41 px figure hanging out of the frame), so the control is 16 px for a ~27 px figure
# in the 32 px frame; a clipping panel cuts anything that still sticks out.
AV_W, AV_H, MODEL = 24, 32, 16
avatar = {'type': 'panel', 'size': [AV_W, AV_H], 'controls': [
    {'frame': image(f'{UI}/hud_avatar', [AV_W, AV_H], layer=1)},
    {'window': {'type': 'panel', 'size': [AV_W - 2, AV_H - 2], 'clips_children': True, 'layer': 3, 'controls': [
        {'model': {'type': 'custom', 'renderer': 'hud_player_renderer', 'size': [MODEL, MODEL], 'layer': 1,
                   'anchor_from': 'top_middle', 'anchor_to': 'top_middle', 'offset': [0, 1]}},
    ]}},
    {'scan': {'type': 'panel', 'size': [AV_W - 2, AV_H - 2], 'clips_children': True, 'layer': 4, 'controls': [
        {'beam': image(f'{UI}/hud_beam', ['100%', 3], keep_ratio=False, alpha=0.6, anchor_from='top_middle', anchor_to='top_middle',
                       offset=loop('hud_avatar_beam', 'offset', [(1.2, [0, -4], [0, -4]), (0.7, [0, -4], [0, '100%'], 'in_out_sine'), (2.1, [0, '100%'], [0, '100%'])]))},
    ]}},
    *[{f'badge_{i + 1}': image(f'textures/mining_tycoon/items/{tex}', [10, 10], layer=6, anchor_from='bottom_right', anchor_to='bottom_right',
                               offset=[3, 3], bindings=[GLOBAL_SUB, view(has(SUB, rank_code(i + 1)))])} for i, tex in enumerate(RANKS)],
]}
profile = board(PROFILE, 'PROFILE', 'hud_led', [
    {'row': {'type': 'stack_panel', 'orientation': 'horizontal', 'size': ['100%c', '100%cm'], 'controls': [
        {'avatar': avatar},
        {'gap': gap(6, 1)},
        {'info': {'type': 'stack_panel', 'orientation': 'vertical', 'size': ['100%cm', '100%c'], 'controls': [
            {'pad': gap(1, 4)},
            {'text': label(strip(SUB, PROFILE, *[rank_code(n) for n in range(1, len(RANKS) + 1)], *MARKS), GLOBAL_SUB)},
            {'bar_gap': gap(1, 3)},
            {'xp': {'type': 'stack_panel', 'orientation': 'horizontal', 'size': ['100%c', 4], 'controls':
                segments('xp', 'hud_xp_on', 'hud_prog_off', (6, 4), prop=SUB, binding=GLOBAL_SUB)}},
        ]}},
    ]}},
], side='right', prop=SUB, binding=GLOBAL_SUB)

# Arrival: the doors the loading screen closed stand shut over the world for a moment, unlock with a flash on the
# seam and slide apart (one-shot: hud.js puts the code in the title for under a second, so they never linger).
doors = {'type': 'panel', 'size': ['100%', '100%'], 'layer': 40, 'bindings': [GLOBAL_TITLE, view(has(TITLE, DOORS))],
         'controls': door_controls(lambda name, kind, steps: seq(name, kind, steps), 'arrive', closing=False)}

# The game shows a title with this control (made by the title factory, replaced by every new title, gone when the
# title has run out). It becomes the studio HUD: hud.js keeps a HUD title up all the time, so there is no plain
# title to hide. Titles from elsewhere (other add-ons, /title) are not shown while the HUD owns the title.
ui['hud_title_text'] = {
    'size': ['100%', '100%'], 'offset': [0, 0],
    'controls': [{'mining_tycoon_hud': {'type': 'panel', 'size': ['100%', '100%'], 'controls': [{'home': home}, {'run': run}, {'profile': profile}, {'doors': doors}]}}],
}


# ---- notifications: the action bar as a MINE-OS card --------------------------------------------------------------
# The action bar factory makes a new hud_actionbar_text for every message (variable $actionbar_text) and the control
# destroys itself when its alpha animation ends. Every animation here is one-shot except the icon pulse.
SHOW = 3.2  # seconds the card stays fully lit (after 0.18 s in, before 0.35 s out); hud.js READ is a bit less
ICON_X = 9  # icon's left edge in the card
body = {'type': 'panel', 'size': ['100%c + 32px', '100%c + 10px'], 'controls': [  # sized by the text
    {'reveal': {'type': 'panel', 'size': ['100%c', '100%c'], 'clips_children': True, 'layer': 6,
                'anchor_from': 'left_middle', 'anchor_to': 'left_middle', 'offset': [25, 0], 'controls': [
        {'text': {'type': 'label', 'text': '$actionbar_text', 'localize': False, 'shadow': True, 'color': [1, 1, 1],
                  'size': ['default', 'default'], 'max_size': [210, 40], 'anchor_from': 'left_middle', 'anchor_to': 'left_middle',
                  'offset': seq('wipe', 'offset', [(0.06, ['-100%', 0], ['-100%', 0]), (0.22, ['-100%', 0], [0, 0], 'out_cubic')])}},
    ]}},
]}
fx = {'type': 'panel', 'size': ['100%sm', '100%sm'], 'controls': [  # the card's size (body is its only sibling)
    {'scan': image(f'{TECH}/scanlines', ['100% - 2px', '100% - 2px'], tiled=True, layer=1)},
    {'flash': image(f'{UI}/hud_note_flash', ['100% - 4px', '100% - 4px'], keep_ratio=False, layer=7,
                    alpha=seq('flash', 'alpha', [(0.08, 0, 0), (0.25, 0.45, 0, 'out_quad')]))},
    {'accent': image(f'{UI}/hud_note_accent', [2, '100% - 8px'], keep_ratio=False, layer=3,
                     anchor_from='left_middle', anchor_to='left_middle', offset=[4, 0])},
    {'ping': image(f'{UI}/hud_note_ping', seq('ping_size', 'size', [(0.5, [10, 10], [34, 34], 'out_quad')]), layer=4,
                   anchor_from='left_middle', anchor_to='center', offset=[ICON_X + 6, 0],
                   alpha=seq('ping', 'alpha', [(0.5, 0.9, 0, 'in_quad')]))},
    {'icon': image(f'{UI}/icons/notify', [12, 12], layer=5, anchor_from='left_middle', anchor_to='left_middle', offset=[ICON_X, 0],
                   alpha=loop('pulse', 'alpha', [(0.55, 1, 0.45, 'in_out_sine'), (0.55, 0.45, 1, 'in_out_sine')]))},
    {'sweep': {'type': 'panel', 'size': ['100%', '100%'], 'clips_children': True, 'layer': 8, 'controls': [
        {'streak': image(f'{TECH}/streak', [26, '100%'], keep_ratio=False, anchor_from='left_middle', anchor_to='left_middle',
                         offset=seq('streak', 'offset', [(0.12, [-30, 0], [-30, 0]), (0.5, [-30, 0], ['100%', 0], 'in_out_sine')]))},
    ]}},
    {'timer': {'type': 'panel', 'size': ['100% - 14px', 1], 'clips_children': True, 'layer': 5,
               'anchor_from': 'bottom_middle', 'anchor_to': 'bottom_middle', 'offset': [2, -2], 'controls': [
        {'bar': image(f'{UI}/hud_note_timer', ['100%', 1], keep_ratio=False, alpha=0.85,
                      offset=seq('timer', 'offset', [(0.3, [0, 0], [0, 0]), (SHOW - 0.12, [0, 0], ['-100%', 0])]))},
    ]}},
]}
ui['hud_actionbar_text'] = {
    'type': 'image', 'texture': f'{UI}/hud_note', 'size': ['100%cm', '100%cm'], 'layer': 30,
    'anchor_from': 'bottom_middle', 'anchor_to': 'bottom_middle',  # above the hotbar and hearts, grows upwards
    'offset': seq('slide', 'offset', [(0.18, [0, -46], [0, -60], 'out_back')]),
    'propagate_alpha': True,
    'alpha': seq('alpha', 'alpha', [(0.08, 0, 1), (0.04, 1, 0.4), (0.06, 0.4, 1), (SHOW, 1, 1), (0.35, 1, 0, 'in_quad')],
                 destroy_at_end='hud_actionbar_text', end_event='hud_actionbar_text_complete'),
    'controls': [{'body': body}, {'fx': fx}],
}

def main():
    write_art()
    (RP / 'ui' / 'hud_screen.json').write_text(json.dumps(ui, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print('written RP/ui/hud_screen.json and the HUD art')


if __name__ == '__main__':
    main()
