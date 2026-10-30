# Generates the studio HUD: RP/ui/hud_screen.json and its art (stone & gold panels, light bar segments, icons).
# Run after changing the HUD:  python3 projects/mining-tycoon/tools/gen_hud.py
#
# How it works: BP/scripts/hud.js puts what the HUD shows in the title text behind an invisible prefix (formatting
# codes) and keeps such a title up all the time. The game's title control (hud_title_text) is replaced by our panels,
# which read the title text (a global UI binding), so no title is ever shown as a title.
# Notifications (hud.js notify/toast) use the action bar: its control (hud_actionbar_text) becomes a MINE-OS card above
# the hotbar that slides up with a flicker, pings, sweeps a light streak over the glass, wipes its text in and drains
# a timer line before it fades.
# - home: "§h§u§1" + lines (money, next goal, where)              -> top-left panel with a coin and a flag
# - run:  "§h§u§2" + one mark "§q§q§<1-9a>" per lit segment + lines (time, haul) -> top-left panel with a light bar
#
# Every visibility test has the one form that is reliable in the HUD on the phone: "contains" = (not ((#s - 'code') =
# #s)). The negated form ((#s - 'code') = #s) and compound tests (not (A or B)) came out true when they should not
# (a plain-title fallback showed the HUD text big in the middle), so the HUD never needs "does not contain".
import json
import pathlib
from PIL import Image

PROJECT = pathlib.Path(__file__).resolve().parent.parent
RP = PROJECT / 'RP'
UI = 'textures/mining_tycoon/ui'
ART = RP / UI
HOME, RUN = '§h§u§1', '§h§u§2'
LEVELS = '0123456789a'
mark = lambda n: f'§q§q§{LEVELS[n]}'

# ---- art ----------------------------------------------------------------------------------------------------------
GOLD_HI, GOLD, GOLD_LO, OUTLINE = '#ffe08a', '#d9a640', '#8a6420', '#120d08'
CYAN = (95, 246, 255)  # MINE-OS light


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


def frame(width, fill_alpha):
    """16x16 nine-slice: dark stone fill (see-through), a gold rim lit from the top-left, rivets in the corners."""
    def c(x, y):
        edge = min(x, y, 15 - x, 15 - y)
        if edge == 0:
            return OUTLINE
        if edge <= width:
            if (x, y) in ((2, 2), (13, 2), (2, 13), (13, 13)) and width > 1:
                return '#fff3c0'
            return GOLD_HI if x + y < 15 and (x <= width or y <= width) else GOLD if x + y < 22 else GOLD_LO
        n = (x * 7 + y * 13) % 5
        return hexc('#2a211a' if n else '#30261d', fill_alpha)
    return paint((16, 16), c)


def seg(colors):
    top, mid, low = colors
    return paint((4, 8), lambda x, y: OUTLINE if x in (0, 3) and False else (top if y < 2 else mid if y < 6 else low))


def icon_goal():
    rows = ['................',
            '...kk...........',
            '...kpkkkkkkk....',
            '...kpyyyyyyyk...',
            '...kpyYYYYyyk...',
            '...kpyyyyyyk....',
            '...kpYyyyyyyk...',
            '...kpyyyyyyyyk..',
            '...kpkkkkkkkk...',
            '...kpk..........',
            '...kpk..........',
            '...kpk..........',
            '..kkpkk.........',
            '.kbbbbbk........',
            '.kkkkkkk........',
            '................']
    pal = {'k': OUTLINE, 'p': '#8a6238', 'y': '#e04a3a', 'Y': '#ff8a6a', 'b': '#6e7682'}
    return paint((16, 16), lambda x, y: pal.get(rows[y][x]))


def icon_backpack():
    rows = ['................',
            '.....kkkkkk.....',
            '....kbbbbbbk....',
            '....kb....bk....',
            '..kkkkkkkkkkkk..',
            '.kLLLLLLLLLLLmk.',
            '.kLllllllllllmk.',
            '.kLlkkkkkkkklmk.',
            '.kLlkyyyyyyklmk.',
            '.kLlkkkYYkkklmk.',
            '.kLlllllllllmmk.',
            '.kLllllllllllmk.',
            '.kmmmmmmmmmmmmk.',
            '..kkkkkkkkkkkk..',
            '................',
            '................']
    pal = {'k': OUTLINE, 'b': '#7a4c20', 'L': '#c98a4a', 'l': '#a86a30', 'm': '#7a4c20', 'y': '#5a3818', 'Y': GOLD}
    return paint((16, 16), lambda x, y: pal.get(rows[y][x]))


def note_card():
    """16x16 nine-slice: dark cyan glass, chamfered corners with bright corner ticks, a thin cyan rim."""
    def c(x, y):
        cx, cy = min(x, 15 - x), min(y, 15 - y)
        if cx + cy < 2:
            return None  # the chamfer
        if cx + cy == 2 or (cx + cy == 3 and min(cx, cy) == 0):
            return CYAN + (255,)  # corner ticks
        if cx == 0 or cy == 0:
            return CYAN + (200 if y == 0 else 120,)
        if y == 1:
            return (40, 120, 140, 230)  # glass highlight under the top rim
        return (6, 22, 30, 222) if y < 8 else (4, 15, 22, 228)
    return paint((16, 16), c)


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


def write_art():
    frame(1, 215).save(ART / 'hud_panel.png')
    note_card().save(ART / 'hud_note.png')
    for name in ('hud_panel', 'hud_note'):
        (ART / f'{name}.json').write_text(json.dumps({'nineslice_size': 4, 'base_size': [16, 16]}, indent=2) + '\n')
    paint((2, 16), lambda x, y: GOLD_HI if y < 5 else GOLD if y < 11 else GOLD_LO).save(ART / 'hud_note_accent.png')
    paint((4, 1), lambda x, y: CYAN + (230,)).save(ART / 'hud_note_timer.png')
    paint((4, 4), lambda x, y: (210, 255, 255, 255)).save(ART / 'hud_note_flash.png')
    ring().save(ART / 'hud_note_ping.png')
    icon_notify().save(ART / 'icons/notify.png')
    seg(('#fff3b0', '#ffc844', '#d98a1c')).save(ART / 'hud_seg_on.png')
    seg(('#ffb08a', '#ff5a3a', '#b02a1a')).save(ART / 'hud_seg_low.png')
    seg(('#3a3230', '#2a2422', '#1e1a18')).save(ART / 'hud_seg_off.png')
    icon_goal().save(ART / 'icons/goal.png')
    icon_backpack().save(ART / 'icons/backpack.png')


# ---- hud_screen.json ----------------------------------------------------------------------------------------------
GLOBAL_TITLE = {'binding_name': '#hud_title_text_string'}


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


ui = {'namespace': 'hud'}
ICON = 10  # icon size in the HUD (16x16 art, drawn smaller)
LINE = 10  # label line height

home = {
    'type': 'image', 'texture': f'{UI}/hud_panel', 'size': ['100%c + 10px', '100%c + 8px'], 'layer': 1,
    'anchor_from': 'top_left', 'anchor_to': 'top_left', 'offset': [4, 4],
    'bindings': [GLOBAL_TITLE, view(has('#hud_title_text_string', HOME))],
    'controls': [{'row': {'type': 'stack_panel', 'orientation': 'horizontal', 'size': ['100%c', '100%cm'], 'controls': [
        {'icons': {'type': 'stack_panel', 'orientation': 'vertical', 'size': [ICON, '100%c'], 'controls': [
            {'coin': image(f'{UI}/icons/coin', [ICON, LINE])},
            {'goal': image(f'{UI}/icons/goal', [ICON, LINE])},
        ]}},
        {'gap': {'type': 'panel', 'size': [4, 1]}},
        {'text': label(strip('#hud_title_text_string', HOME), GLOBAL_TITLE)},
    ]}}],
}

segments = []
for k in range(1, 11):  # an empty segment, and over it the lit one when its own mark is in the title
    tex = 'hud_seg_low' if k <= 3 else 'hud_seg_on'
    segments.append({f'seg_{k}': {'type': 'panel', 'size': [5, 8], 'controls': [
        {'off': image(f'{UI}/hud_seg_off', [4, 8])},
        {'on': image(f'{UI}/{tex}', [4, 8], layer=3, bindings=[GLOBAL_TITLE, view(has('#hud_title_text_string', mark(k)))])},
    ]}})
run = {
    'type': 'image', 'texture': f'{UI}/hud_panel', 'size': ['100%c + 12px', '100%c + 8px'], 'layer': 1,
    'anchor_from': 'top_left', 'anchor_to': 'top_left', 'offset': [4, 4],  # (top centre is under the phone's buttons)
    'bindings': [GLOBAL_TITLE, view(has('#hud_title_text_string', RUN))],
    'controls': [{'col': {'type': 'stack_panel', 'orientation': 'vertical', 'size': ['100%cm', '100%c'], 'controls': [
        {'light': {'type': 'stack_panel', 'orientation': 'horizontal', 'size': ['100%c', 10], 'controls': [
            {'lantern': image(f'{UI}/icons/expedition', [ICON, ICON])},
            {'gap': {'type': 'panel', 'size': [3, 1]}},
            {'bar': {'type': 'stack_panel', 'orientation': 'horizontal', 'size': ['100%c', 8], 'offset': [0, 1], 'controls': segments}},
        ]}},
        {'row_gap': {'type': 'panel', 'size': [1, 2]}},
        {'haul': {'type': 'stack_panel', 'orientation': 'horizontal', 'size': ['100%c', '100%cm'], 'controls': [
            {'pack': image(f'{UI}/icons/backpack', [ICON, ICON])},
            {'gap': {'type': 'panel', 'size': [3, 1]}},
            {'text': label(strip('#hud_title_text_string', RUN, *[mark(n) for n in range(11)]), GLOBAL_TITLE)},
        ]}},
    ]}}],
}
# The game shows a title with this control (made by the title factory, replaced by every new title, gone when the
# title has run out). It becomes the studio HUD: hud.js keeps a HUD title up all the time, so there is no plain
# title to hide. Titles from elsewhere (other add-ons, /title) are not shown while the HUD owns the title.
ui['hud_title_text'] = {
    'size': ['100%', '100%'], 'offset': [0, 0],
    'controls': [{'mining_tycoon_hud': {'type': 'panel', 'size': ['100%', '100%'], 'controls': [{'home': home}, {'run': run}]}}],
}


# ---- notifications: the action bar as a MINE-OS card --------------------------------------------------------------
# The action bar factory makes a new hud_actionbar_text for every message (variable $actionbar_text) and the control
# destroys itself when its alpha animation ends. Every animation here is one-shot except the icon pulse.
TECH = f'{UI}/tech'


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
