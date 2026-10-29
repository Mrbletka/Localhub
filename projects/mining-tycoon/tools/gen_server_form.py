# Generates the full-screen menus: RP/ui/server_form.json and BP/scripts/menu_layout.js (the codes the scripts use).
# Run after changing the menu tree:  python3 projects/mining-tycoon/tools/gen_server_form.py
#
# How it works: a form whose title carries a form tag is drawn full screen. All pages of that form live in ONE form.
# Every page lies in one shared stack; a Nav is a UI toggle that opens its sub-page (and turns into its Back button
# there), so switching pages never closes the form. Real buttons come from the script; each button text starts
# with an invisible list code that says in which List it is drawn. Title flags show/hide Navs (e.g. empty slots).
import json
import pathlib

SLOTS = 2  # must match CONFIG.sessions.slots


class Page:
    def __init__(self, items, heading=None):
        self.items, self.heading = items, heading


class List:
    def __init__(self, name):
        self.name = name


class Nav:
    def __init__(self, name, text, back, page, show_if=None, icon=None, back_icon='back'):
        self.name, self.text, self.back, self.page, self.show_if = f'mining_tycoon_{name}', text, back, page, show_if
        self.icon, self.back_icon = icon, back_icon


FORMS = {
    'start': ('§m§t§s', Page([
        List('start_top'),  # Play, Create session (no sessions yet)
        Nav('go_sessions', 'Sessions', 'Back', show_if='hasSessions', icon='sessions', page=Page(heading='Your sessions: each one is its own mine and its own save.', items=[
            List('start_slots'),
            Nav('go_delete', 'Delete a session', 'Back', icon='delete', page=Page(heading='Pick the session to delete.', items=[
                Nav(f'go_delete_{i}', f'Delete Session {i + 1}', 'Keep it', show_if=f'slot{i}', icon='delete', page=Page(
                    heading=f"Delete Session {i + 1}? Its mine, money, upgrades, rebirths and drills are gone for good.",
                    items=[List(f'start_delete_{i}')]))
                for i in range(SLOTS)
            ])),
        ])),
        List('start_bottom'),  # Exit
    ])),
    'tablet': ('§m§t§t', Page([
        Nav('go_upgrades', 'Upgrades', 'Back', icon='upgrades', page=Page(heading='Mine faster and dig up richer ores.', items=[List('tablet_upgrades')])),
        Nav('go_shop', 'Drills', 'Back', icon='drills', page=Page(heading='Drills earn cash every second while you keep mining.', items=[List('tablet_shop')])),
        Nav('go_rebirth', 'Rebirth', 'Not yet', icon='rebirth', page=Page(
            heading='Rebirth? Money, pick, mine, ore value and drills of this session reset. You keep a permanent cash bonus.',
            items=[List('tablet_rebirth')])),
        List('tablet_bottom'),  # Main menu
    ])),
}
# Loading screen while a mine is built / loaded: no buttons, the script closes it once the player stands in the mine.
FORMS['loading'] = ('§m§t§l', Page([]))
# Notices and small choices (lift, extract, Ore Trader, expedition results): the body text and one list of buttons.
FORMS['notice'] = ('§m§t§n', Page([List('notice')]))
# The Miner's Tablet on an expedition: Keep mining, or give up after a confirm page.
FORMS['run'] = ('§m§t§e', Page([
    List('run_top'),  # Keep mining
    Nav('go_give_up', 'Give up', 'Keep going', icon='exit', page=Page(
        heading='Give up? The lift pulls you home and everything you mined on this run is lost.', items=[List('run_give_up')])),
]))
FLAGS = {'hasSessions': '§h§s', **{f'slot{i}': f'§f§{i + 1}' for i in range(SLOTS)}}
UI = 'textures/mining_tycoon/ui'
ICONS = f'{UI}/icons'
# Art that is not painted yet is left out (text logo, no icon) instead of showing a missing texture.
project = pathlib.Path(__file__).resolve().parent.parent
ART = project / 'RP' / UI
ICON_FILES = sorted(p.stem for p in (ART / 'icons').glob('*.png'))
HAS_LOGO = (ART / 'logo.png').exists()

# List codes: '§p§<a>§<b>§r' - formatting codes, so they stay invisible even without this resource pack.
lists = []
def collect(page):
    for item in page.items:
        if isinstance(item, List): lists.append(item.name)
        elif isinstance(item, Nav): collect(item.page)
for _, root in FORMS.values(): collect(root)
LIST_CODES = {name: f'§p§{n // 10}§{n % 10}§r' for n, name in enumerate(lists, start=11)}

# ---- JSON UI helpers --------------------------------------------------------------------------------------------
def view(expr, target='#visible', source=None):
    b = {'binding_type': 'view'}
    if source: b['source_control_name'] = source
    b.update({'source_property_name': expr, 'target_property_name': target})
    return b

def contains(prop, s):
    return f"(not (({prop} - '{s}') = {prop}))"

def toggle_on(name): return [view('#toggle_state', source=name)]
def toggle_off(name): return [view('(not #toggle_state)', source=name)]
def title_has(flag): return [{'binding_name': '#title_text'}, view(contains('#title_text', flag))]

def label(text, color, **extra):
    d = {'type': 'label', 'text': text, 'color': color, 'shadow': True, 'text_alignment': 'center', 'size': ['100%', 'default']}
    d.update(extra)
    return d

def stack(controls, bindings=None):
    d = {'type': 'stack_panel', 'orientation': 'vertical', 'size': ['100%', '100%c'], 'controls': controls}
    if bindings: d['bindings'] = bindings
    return d

counter = [0]
def wrap(name, control, conds):
    """Nest the control in one stack panel per condition: all must hold for it to show (hidden rows take no space)."""
    for cond in reversed(conds):
        counter[0] += 1
        control = {f'w{counter[0]}': stack([control], cond)}
    return control if conds else control

def render(page, conds):
    """Rows of a page (and its sub-pages) for the shared stack. conds: what must hold for this page to be on the path."""
    navs = [i.name for i in page.items if isinstance(i, Nav)]
    current = conds + [toggle_off(n) for n in navs]  # this page is the one showing
    rows = []
    if page.heading:
        rows.append(wrap('heading', {'heading': label(page.heading, [0.85, 0.85, 0.85], size=['100%', 'default'])}, current))
        rows.append(wrap('heading_gap', {'heading_gap': {'type': 'panel', 'size': ['100%', 8]}}, current))
    for item in page.items:
        if isinstance(item, List):
            rows.append(wrap(item.name, {item.name: {'type': 'stack_panel', 'orientation': 'vertical', 'size': ['100%', '100%c'],
                                                     'controls': [{'list@server_form.mining_tycoon_list_' + item.name: {}}]}}, current))
        else:
            rows += render(item.page, conds + [toggle_on(item.name)])
            child_navs = [i.name for i in item.page.items if isinstance(i, Nav)]
            toggle_conds = conds + [toggle_off(n) for n in navs if n != item.name] + [toggle_off(n) for n in child_navs]
            if item.show_if: toggle_conds.append(title_has(FLAGS[item.show_if]))
            rows.append(wrap(item.name, {f'{item.name}_row': {'type': 'panel', 'size': ['100%', 34], 'controls': [
                {f'{item.name}@server_form.mining_tycoon_nav_toggle': {
                    '$toggle_name': item.name, '$nav_text': item.text, '$nav_back_text': item.back,
                    '$nav_icon': f'{ICONS}/{item.icon}', '$nav_back_icon': f'{ICONS}/{item.back_icon}',
                    '$nav_icon_visible': item.icon in ICON_FILES, '$nav_back_icon_visible': item.back_icon in ICON_FILES}}]}}, toggle_conds))
    return rows

# ---- server_form.json ---------------------------------------------------------------------------------------------
tags = [tag for tag, _ in FORMS.values()]
ui = {'namespace': 'server_form'}
ui['main_screen_content'] = {
    'size': ['100%', '100%'],
    'modifications': [{'array_name': 'controls', 'operation': 'insert_back', 'value': [
        {'mining_tycoon_form_factory': {'type': 'panel', 'size': ['100%', '100%'], 'factory': {
            'name': 'server_form_factory', 'control_ids': {'long_form': '@server_form.mining_tycoon_long_form'}}}}]}],
}
not_ours = '(#title_text' + ''.join(f" - '{t}'" for t in tags) + ')'
ui['long_form'] = {'modifications': [{'array_name': 'bindings', 'operation': 'insert_back', 'value': [
    {'binding_name': '#title_text'}, view(f'({not_ours} = #title_text)')]}]}

# ---- animations ---------------------------------------------------------------------------------------------------
# Loops are chains: each animation names the next one. "%" offsets/sizes are relative to the parent (the background
# image for the effects, so they stay glued to its pixels: the art is 128x64, one texel = 1/128 x 1/64 of it).
def anim(name, kind, duration, frm, to, nxt=None, easing='linear'):
    d = {'anim_type': kind, 'easing': easing, 'duration': duration, 'from': frm, 'to': to}
    if nxt: d['next'] = f'@server_form.{nxt}'
    ui[name] = d
    return f'@server_form.{name}'

def chain(prefix, kind, steps, easing='linear'):
    """steps: [(duration, from, to)], looping back to the first step."""
    names = [f'{prefix}_{i}' for i in range(len(steps))]
    for i, (dur, frm, to, *ease) in enumerate(steps):
        anim(names[i], kind, dur, frm, to, names[(i + 1) % len(steps)], ease[0] if ease else easing)
    return f'@server_form.{names[0]}'

def pct(v, total): return f'{v / total * 100:.2f}%'

LIGHTS = [(14, 9), (113, 9)]  # lantern texels in menu_bg.png
GEMS = [(7, 30), (23, 46), (5, 52), (35, 20), (122, 28), (109, 44), (125, 50), (95, 18), (119, 6)]  # gem highlights (off the centre)
RAIL = 59  # rail row: the minecart's wheels roll on it

chain('mining_tycoon_logo_float', 'offset', [(1.6, [0, 0], [0, -2]), (1.6, [0, -2], [0, 0])], 'in_out_sine')
# Sparkles on the logo (positions in % of the 128x40 logo art).
LOGO_SPARKLE_AT = [(3.5, 68.8), (93.4, 68.8), (78.5, 6.3)]  # ruby glint, diamond glint, top of the G (128x40 art)
LOGO_SPARKLES = [{f'logo_sparkle_{i}': {'type': 'image', 'texture': f'{UI}/fx_sparkle', 'size': [14, 14], 'layer': 1,
                                        'anchor_from': 'top_left', 'anchor_to': 'center', 'offset': [f'{x}%', f'{y}%'],
                                        'alpha': chain(f'mining_tycoon_logo_twinkle_{i}', 'alpha',
                                                       [(0.2, 0, 1), (0.5, 1, 0), (2.4 + i * 1.3, 0, 0)])}}
                 for i, (x, y) in enumerate(LOGO_SPARKLE_AT)]

def background_fx():
    fx = []
    flicker = [[(0.35, 0.55, 0.95), (0.12, 0.95, 0.75), (0.5, 0.75, 1.0), (0.7, 1.0, 0.55)],
               [(0.5, 0.6, 1.0), (0.2, 1.0, 0.8), (0.3, 0.8, 0.95), (0.9, 0.95, 0.6)]]
    for i, (x, y) in enumerate(LIGHTS):
        fx.append({f'glow_{i}': {'type': 'image', 'texture': f'{UI}/fx_glow', 'size': ['24%', '48%'], 'layer': 2, 'keep_ratio': False,
                                 'anchor_from': 'top_left', 'anchor_to': 'center', 'offset': [pct(x + 0.5, 128), pct(y + 0.5, 64)],
                                 'alpha': chain(f'mining_tycoon_flicker_{i}', 'alpha', flicker[i], 'in_out_sine')}})
    for i, (x, y) in enumerate(GEMS):
        rest = 2.2 + (i * 1.37) % 3.5  # every gem twinkles on its own rhythm
        fx.append({f'sparkle_{i}': {'type': 'image', 'texture': f'{UI}/fx_sparkle', 'size': ['7.03%', '14.06%'], 'layer': 3, 'keep_ratio': False,
                                    'anchor_from': 'top_left', 'anchor_to': 'center', 'offset': [pct(x + 0.5, 128), pct(y + 0.5, 64)],
                                    'alpha': chain(f'mining_tycoon_twinkle_{i}', 'alpha',
                                                   [(0.6 + i * 0.45, 0, 0), (0.18, 0, 1), (0.45, 1, 0), (rest, 0, 0)])}})
    for i in range(6):
        x = 8 + i * 17 + (i % 2) * 5
        up = 9 + (i * 2.3) % 6
        fx.append({f'dust_{i}': {'type': 'image', 'texture': f'{UI}/fx_dust', 'size': ['0.78%', '1.56%'], 'layer': 2, 'alpha': 0.8, 'keep_ratio': False,
                                 'anchor_from': 'top_left', 'anchor_to': 'top_left',
                                 'offset': chain(f'mining_tycoon_dust_{i}', 'offset',
                                                 [(up, [f'{x}%', '104%'], [f'{x + 4}%', '-6%']), (0.01, [f'{x + 4}%', '-6%'], [f'{x}%', '104%'])])}})
    cart_y = pct(RAIL + 1 - 64, 64)  # bottom of the sprite on the rail row
    fx.append({'minecart': {'type': 'panel', 'size': ['9.38%', '14.06%'], 'layer': 4, 'anchor_from': 'bottom_left', 'anchor_to': 'bottom_left',
                            'offset': chain('mining_tycoon_cart', 'offset',
                                            [(2.5, ['-12%', cart_y], ['-12%', cart_y]), (12, ['-12%', cart_y], ['104%', cart_y]),
                                             (4, ['104%', cart_y], ['104%', cart_y])]),
                            'controls': [{'cart': {'type': 'image', 'texture': f'{UI}/fx_minecart', 'size': ['100%', '100%'], 'keep_ratio': False}}]}})
    return fx

# Loader: a gold pick strikes a gold ore that shakes on every hit (both loops last 0.67 s, so they stay in step).
LOADER = [{'loader': {'type': 'panel', 'size': ['100%', 44], 'controls': [
    {'ore': {'type': 'image', 'texture': 'textures/mining_tycoon/blocks/ore_gold', 'size': [28, 28], 'offset': chain('mining_tycoon_loader_ore', 'offset',
        [(0.12, [6, 4], [6, 4]), (0.05, [6, 4], [8, 4]), (0.05, [8, 4], [4, 4]), (0.05, [4, 4], [6, 4]), (0.4, [6, 4], [6, 4])])}},
    {'pick': {'type': 'image', 'texture': 'textures/mining_tycoon/items/pick_5', 'size': [28, 28], 'layer': 1, 'offset': chain('mining_tycoon_loader_pick', 'offset',
        [(0.12, [-14, -12], [-6, -2], 'in_quad'), (0.35, [-6, -2], [-14, -12], 'out_cubic'), (0.2, [-14, -12], [-14, -12])])}},
]}}]

# The cave goes in the screen's background slot ($screen_bg_content -> "bg_no_safezone_screen_panel" in
# common.base_screen): it fills the whole screen. Everything in the form itself is laid out inside the phone's safe
# area, so a background there always stopped short of the screen edges.
ui['third_party_server_screen'] = {'$screen_bg_content': 'server_form.mining_tycoon_screen_bg'}
ui['mining_tycoon_screen_bg'] = {
    'type': 'panel', 'size': ['100%', '100%'],
    'bindings': [{'binding_name': '#title_text'}, view(f'(not ({not_ours} = #title_text))')],  # only behind our menus
    'controls': [{'background': {'type': 'image', 'texture': f'{UI}/menu_bg', 'size': ['100%', '100%'], 'layer': 1,
                                 'keep_ratio': False,  # images keep the 2:1 ratio of their art by default: on a wider
                                 'controls': background_fx()}}],  # screen the cave stopped short of both edges
}

screens = []
for key, (tag, root) in FORMS.items():
    rows = render(root, [])
    screens.append({f'{key}_menu': {
        'type': 'panel', 'size': ['100%', '100%'], 'layer': 10,
        'bindings': title_has(tag),
        'controls': [
            {'content': {'type': 'stack_panel', 'orientation': 'vertical', 'size': [190, '100%c'], 'anchor_from': 'center',
                         'anchor_to': 'center', 'layer': 20,
                         'offset': anim(f'mining_tycoon_content_in_{key}', 'offset', 0.35, [0, 14], [0, 0], easing='out_cubic'),
                         'controls': [
                {'logo_row': {'type': 'panel', 'size': ['100%', 56], 'controls': [
                    {'logo': {**({'type': 'image', 'texture': f'{UI}/logo'} if HAS_LOGO else
                                 label('MINING TYCOON', [1.0, 0.82, 0.28], font_type='MinecraftTen', font_scale_factor=2.0)),
                              'size': [180, 56] if HAS_LOGO else ['100%', 'default'],
                              'offset': anim(f'mining_tycoon_logo_drop_{key}', 'offset', 0.6, [0, -36], [0, 0],
                                             'mining_tycoon_logo_float_0', 'out_back'),
                              'controls': LOGO_SPARKLES if HAS_LOGO else []}}]}},
                {'logo_gap': {'type': 'panel', 'size': ['100%', 4]}},
                {'body': label('#form_text', [0.95, 0.95, 0.95], bindings=[{'binding_name': '#form_text'}])},
                {'body_gap': {'type': 'panel', 'size': ['100%', 10]}},
                *rows,
                *(LOADER if key == 'loading' else []),
            ]}},
        ]}})
ui['mining_tycoon_long_form'] = {'type': 'panel', 'size': ['100%', '100%'], 'controls': screens}

ICON_BOB = chain('mining_tycoon_icon_bob', 'offset', [(0.3, [7, 0], [7, -1.5]), (0.3, [7, -1.5], [7, 0])], 'in_out_sine')

# A List shows the form buttons whose text starts with its code (one template per list: the code is written in).
COLLECTION = {'binding_type': 'collection', 'binding_collection_name': 'form_buttons'}
for name, code in LIST_CODES.items():
    ui[f'mining_tycoon_list_{name}'] = {
        'type': 'stack_panel', 'orientation': 'vertical', 'size': ['100%', '100%c'],
        'factory': {'name': 'buttons', 'control_ids': {'button': f'@server_form.mining_tycoon_item_{name}'}},
        'collection_name': 'form_buttons',
        'bindings': [{'binding_name': '#form_button_contents', 'binding_name_override': '#collection_length'}],
    }
    ui[f'mining_tycoon_item_{name}'] = {
        'type': 'panel', 'size': ['100%', 34],
        'bindings': [
            {'binding_type': 'collection_details', 'binding_collection_name': 'form_buttons'},
            {'binding_name': '#form_button_text', **COLLECTION},
            view(contains('#form_button_text', code)),
        ],
        'controls': [{'form_button@server_form.mining_tycoon_form_button': {}}],
    }
strip = '#form_button_text' + ''.join(f" - '{c}'" for c in LIST_CODES.values())
ui['mining_tycoon_form_button@common.button'] = {
    '$pressed_button_name': 'button.form_button_click',
    'size': ['100%', 30], 'anchor_from': 'top_middle', 'anchor_to': 'top_middle',
    'bindings': [{'binding_type': 'collection_details', 'binding_collection_name': 'form_buttons'}],
    'controls': [
        {'default@server_form.mining_tycoon_button_state': {'$state_texture': 'textures/mining_tycoon/ui/button', '$state_text_color': [1.0, 0.84, 0.35]}},
        {'hover@server_form.mining_tycoon_button_state': {'$state_texture': 'textures/mining_tycoon/ui/button_hover', '$state_text_color': [1.0, 0.96, 0.75], '$state_icon_offset': ICON_BOB}},
        {'pressed@server_form.mining_tycoon_button_state': {'$state_texture': 'textures/mining_tycoon/ui/button_pressed', '$state_text_color': [1.0, 0.96, 0.75], '$state_text_offset': [0, 1]}},
    ],
}

def icon(texture=None, offset=(7, 0)):
    """16x16 icon at the left of a button: a fixed texture, or the form button's own icon from the script."""
    d = {'type': 'image', 'size': [16, 16], 'layer': 2, 'anchor_from': 'left_middle', 'anchor_to': 'left_middle',
         'offset': offset if isinstance(offset, str) else list(offset)}
    if texture:
        d['texture'] = texture
    else:
        d['bindings'] = [
            {'binding_name': '#form_button_texture', 'binding_name_override': '#texture', **COLLECTION},
            {'binding_name': '#form_button_texture_file_system', 'binding_name_override': '#texture_file_system', **COLLECTION},
            view("(not ((#texture = '') or (#texture = 'loading')))"),
        ]
    return {'icon': d}

ui['mining_tycoon_button_state'] = {
    'type': 'image', 'texture': '$state_texture', 'size': ['100%', '100%'], '$state_text_offset|default': [0, 0],
    '$state_icon_offset|default': [7, 0],
    'controls': [
        icon(offset='$state_icon_offset'),
        {'label': label('#text', '$state_text_color', offset='$state_text_offset', size=['100% - 48px', 'default'],
                        max_size=['100% - 48px', 22], layer=1,
                        bindings=[{'binding_name': '#form_button_text', **COLLECTION}, view(f'({strip})', '#text')])},
    ],
}

# Nav: an on/off UI toggle. Off: "$nav_text" (opens the sub-page). On: "$nav_back_text" (closes it again).
ui['mining_tycoon_nav_toggle@common.toggle'] = {
    'size': ['100%', 30], 'anchor_from': 'top_middle', 'anchor_to': 'top_middle',
    '$toggle_binding_type': 'none',
    '$unchecked_control': 'server_form.mining_tycoon_nav_open',
    '$unchecked_hover_control': 'server_form.mining_tycoon_nav_open_hover',
    '$checked_control': 'server_form.mining_tycoon_nav_back',
    '$checked_hover_control': 'server_form.mining_tycoon_nav_back_hover',
    '$unchecked_locked_control': 'server_form.mining_tycoon_nav_open',
    '$unchecked_locked_hover_control': 'server_form.mining_tycoon_nav_open',
    '$checked_locked_control': 'server_form.mining_tycoon_nav_back',
    '$checked_locked_hover_control': 'server_form.mining_tycoon_nav_back',
}
for name, tex, color, text, ico, bob in [
    ('open', 'button', [1.0, 0.84, 0.35], '$nav_text', '$nav_icon', False),
    ('open_hover', 'button_hover', [1.0, 0.96, 0.75], '$nav_text', '$nav_icon', True),
    ('back', 'button', [1.0, 0.84, 0.35], '$nav_back_text', '$nav_back_icon', False),
    ('back_hover', 'button_hover', [1.0, 0.96, 0.75], '$nav_back_text', '$nav_back_icon', True),
]:
    ui[f'mining_tycoon_nav_{name}'] = {
        'type': 'image', 'texture': f'{UI}/{tex}', 'size': ['100%', '100%'],
        'controls': [{'icon': {**icon(ico, ICON_BOB if bob else (7, 0))['icon'], 'visible': ico + '_visible'}}, {'label': label(text, color, size=['100% - 48px', 'default'], layer=1)}],
    }

(project / 'RP' / 'ui' / 'server_form.json').write_text(json.dumps(ui, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')

layout = {'forms': {k: tag for k, (tag, _) in FORMS.items()}, 'lists': LIST_CODES, 'flags': FLAGS, 'icons': ICON_FILES}
(project / 'BP' / 'scripts' / 'menu_layout.js').write_text(
    '// Generated by tools/gen_server_form.py - do not edit. Codes the menus put in form titles and button texts so\n'
    '// RP/ui/server_form.json knows which full-screen menu, page list and options to draw.\n'
    f'export const MENU = {json.dumps(layout, indent=2, ensure_ascii=False)};\n', encoding='utf-8')
print('written', len(LIST_CODES), 'lists,', len(FORMS), 'forms')
