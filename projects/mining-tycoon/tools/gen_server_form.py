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
    def __init__(self, name, text, back, page, show_if=None):
        self.name, self.text, self.back, self.page, self.show_if = f'mining_tycoon_{name}', text, back, page, show_if


FORMS = {
    'start': ('§m§t§s', Page([
        List('start_top'),  # Play, Create session (no sessions yet)
        Nav('go_sessions', 'Sessions', 'Back', show_if='hasSessions', page=Page(heading='Your sessions: each one is its own mine and its own save.', items=[
            List('start_slots'),
            Nav('go_delete', 'Delete a session', 'Back', page=Page(heading='Pick the session to delete.', items=[
                Nav(f'go_delete_{i}', f'Delete Session {i + 1}', 'Keep it', show_if=f'slot{i}', page=Page(
                    heading=f"Delete Session {i + 1}? Its mine, money, upgrades, rebirths and drills are gone for good.",
                    items=[List(f'start_delete_{i}')]))
                for i in range(SLOTS)
            ])),
        ])),
        List('start_bottom'),  # Exit
    ])),
    'tablet': ('§m§t§t', Page([
        Nav('go_upgrades', 'Upgrades', 'Back', page=Page(heading='Mine faster and dig up richer ores.', items=[List('tablet_upgrades')])),
        Nav('go_shop', 'Drills', 'Back', page=Page(heading='Drills earn cash every second while you keep mining.', items=[List('tablet_shop')])),
        Nav('go_rebirth', 'Rebirth', 'Not yet', page=Page(
            heading='Rebirth? Money, pick, mine, ore value and drills of this session reset. You keep a permanent cash bonus.',
            items=[List('tablet_rebirth')])),
        List('tablet_bottom'),  # Main menu
    ])),
}
FLAGS = {'hasSessions': '§h§s', **{f'slot{i}': f'§f§{i + 1}' for i in range(SLOTS)}}

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
                {f'{item.name}@server_form.mining_tycoon_nav_toggle': {'$toggle_name': item.name, '$nav_text': item.text, '$nav_back_text': item.back}}]}}, toggle_conds))
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

screens = []
for key, (tag, root) in FORMS.items():
    rows = render(root, [])
    screens.append({f'{key}_menu': {
        'type': 'panel', 'size': ['100%', '100%'], 'layer': 10,
        'bindings': title_has(tag),
        'controls': [
            {'background': {'type': 'image', 'texture': 'textures/mining_tycoon/ui/menu_bg', 'size': ['100% + 64px', '100% + 32px'],
                            'anchor_from': 'center', 'anchor_to': 'center', 'layer': 1}},
            {'content': {'type': 'stack_panel', 'orientation': 'vertical', 'size': [190, '100%c'], 'anchor_from': 'center',
                         'anchor_to': 'center', 'layer': 2, 'controls': [
                {'logo': label('MINING TYCOON', [1.0, 0.82, 0.28], font_type='MinecraftTen', font_scale_factor=2.0)},
                {'logo_gap': {'type': 'panel', 'size': ['100%', 6]}},
                {'body': label('#form_text', [0.95, 0.95, 0.95], bindings=[{'binding_name': '#form_text'}])},
                {'body_gap': {'type': 'panel', 'size': ['100%', 10]}},
                *rows,
            ]}},
        ]}})
ui['mining_tycoon_long_form'] = {'type': 'panel', 'size': ['100%', '100%'], 'controls': screens}

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
        {'hover@server_form.mining_tycoon_button_state': {'$state_texture': 'textures/mining_tycoon/ui/button_hover', '$state_text_color': [1.0, 0.96, 0.75]}},
        {'pressed@server_form.mining_tycoon_button_state': {'$state_texture': 'textures/mining_tycoon/ui/button_pressed', '$state_text_color': [1.0, 0.96, 0.75], '$state_text_offset': [0, 1]}},
    ],
}
ui['mining_tycoon_button_state'] = {
    'type': 'image', 'texture': '$state_texture', 'size': ['100%', '100%'], '$state_text_offset|default': [0, 0],
    'controls': [{'label': label('#text', '$state_text_color', offset='$state_text_offset', size=['100% - 12px', 'default'],
                                 max_size=['100% - 12px', 22], layer=1,
                                 bindings=[{'binding_name': '#form_button_text', **COLLECTION}, view(f'({strip})', '#text')])}],
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
for name, tex, color, text in [
    ('open', 'button', [1.0, 0.84, 0.35], '$nav_text'),
    ('open_hover', 'button_hover', [1.0, 0.96, 0.75], '$nav_text'),
    ('back', 'button', [1.0, 0.84, 0.35], '$nav_back_text'),
    ('back_hover', 'button_hover', [1.0, 0.96, 0.75], '$nav_back_text'),
]:
    ui[f'mining_tycoon_nav_{name}'] = {
        'type': 'image', 'texture': f'textures/mining_tycoon/ui/{tex}', 'size': ['100%', '100%'],
        'controls': [{'label': label(text, color, size=['100% - 12px', 'default'], layer=1)}],
    }

project = pathlib.Path(__file__).resolve().parent.parent
(project / 'RP' / 'ui' / 'server_form.json').write_text(json.dumps(ui, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')

layout = {'forms': {k: tag for k, (tag, _) in FORMS.items()}, 'lists': LIST_CODES, 'flags': FLAGS}
(project / 'BP' / 'scripts' / 'menu_layout.js').write_text(
    '// Generated by tools/gen_server_form.py - do not edit. Codes the menus put in form titles and button texts so\n'
    '// RP/ui/server_form.json knows which full-screen menu, page list and options to draw.\n'
    f'export const MENU = {json.dumps(layout, indent=2, ensure_ascii=False)};\n', encoding='utf-8')
print('written', len(LIST_CODES), 'lists,', len(FORMS), 'forms')
