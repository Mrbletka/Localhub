# Generates RP/ui/server_form.json (the full-screen menus). Run: python3 projects/mining-tycoon/tools/gen_server_form.py
# The prefixes and title flags must match BP/scripts/menu.js (LIST, HAS_SESSIONS) and config.js (menu.tag).
import json
import pathlib
TAG = '§m§t§s'            # form is drawn full screen
HAS_SESSIONS = '§h§s'     # title flag: show the Sessions page toggle
PREFIX = {1: '§p§1§r', 2: '§p§2§r', 3: '§p§3§r'}  # button text prefix: which list the button belongs to
NAV_TOGGLE = 'mining_tycoon_go_sessions'

def contains(prop, s):
    return f"(not (({prop} - '{s}') = {prop}))"

def view(expr, target='#visible', source=None):
    b = {'binding_type': 'view', 'source_property_name': expr, 'target_property_name': target}
    if source: b = {'binding_type': 'view', 'source_control_name': source, 'source_property_name': expr, 'target_property_name': target}
    return b

COLLECTION = {'binding_type': 'collection', 'binding_collection_name': 'form_buttons'}
strip = '#form_button_text' + ''.join(f" - '{p}'" for p in PREFIX.values())

ui = {'namespace': 'server_form'}
ui['main_screen_content'] = {
    'size': ['100%', '100%'],
    'modifications': [{'array_name': 'controls', 'operation': 'insert_back', 'value': [
        {'mining_tycoon_form_factory': {'type': 'panel', 'size': ['100%', '100%'], 'factory': {
            'name': 'server_form_factory', 'control_ids': {'long_form': '@server_form.mining_tycoon_long_form'}}}}]}],
}
ui['long_form'] = {'modifications': [{'array_name': 'bindings', 'operation': 'insert_back', 'value': [
    {'binding_name': '#title_text'}, view(f"((#title_text - '{TAG}') = #title_text)")]}]}
ui['mining_tycoon_long_form'] = {'type': 'panel', 'size': ['100%', '100%'], 'controls': [
    {'start_menu@server_form.mining_tycoon_start_menu': {'bindings': [{'binding_name': '#title_text'}, view(contains('#title_text', TAG))]}}]}

def label(text, color, **extra):
    d = {'type': 'label', 'text': text, 'color': color, 'shadow': True, 'text_alignment': 'center', 'size': ['100%', 'default']}
    d.update(extra)
    return d

def gap(h):
    return {'type': 'panel', 'size': ['100%', h]}

# Page 1: body, list 1, [Sessions toggle], list 2.  Page 2: text, list 3, Back toggle.
# Lists show only the form buttons whose text carries their prefix; hidden rows take no space in a stack panel.
ui['mining_tycoon_start_menu'] = {'type': 'panel', 'size': ['100%', '100%'], 'layer': 10, 'controls': [
    {'background': {'type': 'image', 'texture': 'textures/mining_tycoon/ui/menu_bg', 'size': ['100% + 64px', '100% + 32px'],
                    'anchor_from': 'center', 'anchor_to': 'center', 'layer': 1}},
    {'content': {'type': 'stack_panel', 'orientation': 'vertical', 'size': [190, '100%c'], 'anchor_from': 'center', 'anchor_to': 'center',
                 'layer': 2, 'controls': [
        {'logo': label('MINING TYCOON', [1.0, 0.82, 0.28], font_type='MinecraftTen', font_scale_factor=2.0)},
        {'logo_gap': gap(6)},
        {'page_start': {'type': 'stack_panel', 'orientation': 'vertical', 'size': ['100%', '100%c'],
                        'bindings': [view('(not #toggle_state)', source=NAV_TOGGLE)], 'controls': [
            {'body': label('#form_text', [0.92, 0.92, 0.92], bindings=[{'binding_name': '#form_text'}])},
            {'body_gap': gap(10)},
            {'list_1@server_form.mining_tycoon_list_1': {}},
            {'sessions_row': {'type': 'panel', 'size': ['100%', 34],
                              'bindings': [{'binding_name': '#title_text'}, view(contains('#title_text', HAS_SESSIONS))],
                              'controls': [{f'{NAV_TOGGLE}@server_form.mining_tycoon_nav_toggle': {'$nav_text': 'Sessions', '$toggle_group_forced_index': 1}}]}},
            {'list_2@server_form.mining_tycoon_list_2': {}},
        ]}},
        {'page_sessions': {'type': 'stack_panel', 'orientation': 'vertical', 'size': ['100%', '100%c'],
                           'bindings': [view('#toggle_state', source=NAV_TOGGLE)], 'controls': [
            {'heading': label('Your sessions: each one is its own mine and its own save.', [0.92, 0.92, 0.92])},
            {'heading_gap': gap(10)},
            {'list_3@server_form.mining_tycoon_list_3': {}},
            {'back_row': {'type': 'panel', 'size': ['100%', 34], 'controls': [
                {'mining_tycoon_go_start@server_form.mining_tycoon_nav_toggle': {'$nav_text': 'Back', '$toggle_group_forced_index': 0}}]}},
        ]}},
    ]}},
]}

for n, prefix in PREFIX.items():
    ui[f'mining_tycoon_list_{n}'] = {
        'type': 'stack_panel', 'orientation': 'vertical', 'size': ['100%', '100%c'],
        'factory': {'name': 'buttons', 'control_ids': {'button': f'@server_form.mining_tycoon_item_{n}'}},
        'collection_name': 'form_buttons',
        'bindings': [{'binding_name': '#form_button_contents', 'binding_name_override': '#collection_length'}],
    }
    ui[f'mining_tycoon_item_{n}'] = {
        'type': 'panel', 'size': ['100%', 34],
        'bindings': [
            {'binding_type': 'collection_details', 'binding_collection_name': 'form_buttons'},
            {'binding_name': '#form_button_text', **COLLECTION},
            view(contains('#form_button_text', prefix)),
        ],
        'controls': [{'form_button@server_form.mining_tycoon_form_button': {}}],
    }

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

# Page switch: radio toggles in one group, handled entirely in the UI (the form stays open).
ui['mining_tycoon_nav_toggle@common.toggle'] = {
    'size': ['100%', 30], 'anchor_from': 'top_middle', 'anchor_to': 'top_middle',
    '$toggle_name': 'mining_tycoon_page', '$radio_toggle_group': True, '$toggle_group_default_selected': 0,
    '$toggle_binding_type': 'none',
    '$unchecked_control': 'server_form.mining_tycoon_nav_default',
    '$checked_control': 'server_form.mining_tycoon_nav_default',
    '$unchecked_hover_control': 'server_form.mining_tycoon_nav_hover',
    '$checked_hover_control': 'server_form.mining_tycoon_nav_hover',
    '$unchecked_locked_control': 'server_form.mining_tycoon_nav_default',
    '$unchecked_locked_hover_control': 'server_form.mining_tycoon_nav_default',
    '$checked_locked_control': 'server_form.mining_tycoon_nav_default',
    '$checked_locked_hover_control': 'server_form.mining_tycoon_nav_default',
}
for state, tex, color in [('default', 'button', [1.0, 0.84, 0.35]), ('hover', 'button_hover', [1.0, 0.96, 0.75])]:
    ui[f'mining_tycoon_nav_{state}'] = {
        'type': 'image', 'texture': f'textures/mining_tycoon/ui/{tex}', 'size': ['100%', '100%'],
        'controls': [{'label': label('$nav_text', color, size=['100% - 12px', 'default'], layer=1)}],
    }

out = pathlib.Path(__file__).resolve().parent.parent / 'RP' / 'ui' / 'server_form.json'
out.write_text(json.dumps(ui, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
print('written', out)
