# Generates the studio HUD: RP/ui/hud_screen.json and its art (stone & gold panels, light bar segments, icons).
# Run after changing the HUD:  python3 projects/mining-tycoon/tools/gen_hud.py
#
# How it works: BP/scripts/hud.js puts what the HUD shows in the title text behind an invisible prefix (formatting
# codes). The title text is a global UI binding, so panels in the HUD's root panel can show it all the time; the plain
# title is hidden while it carries a HUD prefix. Toasts ride in the subtitle (prefix TOAST) and get their own banner.
# - home: "§h§u§1" + lines (money, next goal, where)              -> top-left panel with a coin and a flag
# - run:  "§h§u§2" + level mark "§q§q§<0-9a>" + lines (time, haul) -> top-centre panel with a 10-segment light bar
import json
import pathlib
from PIL import Image

PROJECT = pathlib.Path(__file__).resolve().parent.parent
RP = PROJECT / 'RP'
UI = 'textures/mining_tycoon/ui'
ART = RP / UI
HOME, RUN, TOAST = '§h§u§1', '§h§u§2', '§t§q§s'
LEVELS = '0123456789a'
mark = lambda n: f'§q§q§{LEVELS[n]}'

# ---- art ----------------------------------------------------------------------------------------------------------
GOLD_HI, GOLD, GOLD_LO, OUTLINE = '#ffe08a', '#d9a640', '#8a6420', '#120d08'


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


def write_art():
    frame(1, 215).save(ART / 'hud_panel.png')
    frame(2, 235).save(ART / 'hud_toast.png')
    for name in ('hud_panel', 'hud_toast'):
        (ART / f'{name}.json').write_text(json.dumps({'nineslice_size': 4, 'base_size': [16, 16]}, indent=2) + '\n')
    seg(('#fff3b0', '#ffc844', '#d98a1c')).save(ART / 'hud_seg_on.png')
    seg(('#ffb08a', '#ff5a3a', '#b02a1a')).save(ART / 'hud_seg_low.png')
    seg(('#3a3230', '#2a2422', '#1e1a18')).save(ART / 'hud_seg_off.png')
    icon_goal().save(ART / 'icons/goal.png')
    icon_backpack().save(ART / 'icons/backpack.png')


# ---- hud_screen.json ----------------------------------------------------------------------------------------------
GLOBAL_TITLE = {'binding_name': '#hud_title_text_string'}
GLOBAL_SUB = {'binding_name': '#hud_subtitle_text_string'}


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
# The plain title (and its subtitle) stays hidden while it carries HUD data or a toast.
ui['hud_title_text'] = {'bindings': [GLOBAL_TITLE, GLOBAL_SUB, view(
    f"(not ({has('#hud_title_text_string', HOME)} or {has('#hud_title_text_string', RUN)} or {has('#hud_subtitle_text_string', TOAST)}))")]}

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
for k in range(1, 11):
    lit = f"({' or '.join(has('#hud_title_text_string', mark(n)) for n in range(k, 11))})"
    tex = 'hud_seg_low' if k <= 3 else 'hud_seg_on'
    segments.append({f'seg_{k}': {'type': 'panel', 'size': [5, 8], 'controls': [
        {'off': image(f'{UI}/hud_seg_off', [4, 8], bindings=[GLOBAL_TITLE, view(f'(not {lit})')])},
        {'on': image(f'{UI}/{tex}', [4, 8], bindings=[GLOBAL_TITLE, view(lit)])},
    ]}})
run = {
    'type': 'image', 'texture': f'{UI}/hud_panel', 'size': ['100%c + 12px', '100%c + 8px'], 'layer': 1,
    'anchor_from': 'top_middle', 'anchor_to': 'top_middle', 'offset': [0, 4],
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
toast = {
    'type': 'image', 'texture': f'{UI}/hud_toast', 'size': ['100%c + 16px', '100%c + 10px'], 'layer': 6,
    'anchor_from': 'top_middle', 'anchor_to': 'top_middle', 'offset': [0, 46],
    'bindings': [GLOBAL_SUB, view(has('#hud_subtitle_text_string', TOAST))],
    'controls': [{'text': label(strip('#hud_subtitle_text_string', TOAST), GLOBAL_SUB, text_alignment='center', max_size=[220, 60])}],
}
ui['mining_tycoon_hud'] = {'type': 'panel', 'size': ['100%', '100%'], 'layer': 30, 'controls': [
    {'home': home}, {'run': run}, {'toast': toast}]}
ui['root_panel'] = {'modifications': [{'array_name': 'controls', 'operation': 'insert_back', 'value': [
    {'mining_tycoon_hud@hud.mining_tycoon_hud': {}}]}]}


def main():
    write_art()
    (RP / 'ui' / 'hud_screen.json').write_text(json.dumps(ui, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print('written RP/ui/hud_screen.json and the HUD art')


if __name__ == '__main__':
    main()
