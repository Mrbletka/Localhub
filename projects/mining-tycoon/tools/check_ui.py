# Checks our JSON UI files before they reach the phone:
# - every property name against the documented JSON UI properties (a typo like "clip_children" for "clips_children"
#   otherwise shows up as content-log errors in game);
# - no compound text tests in view bindings (string subtraction combined with or/and evaluated wrong on the phone:
#   nest one simple test per panel instead).
# Run after the UI generators:  python3 projects/mining-tycoon/tools/check_ui.py
import json
import pathlib
import re
import sys

UI = pathlib.Path(__file__).resolve().parent.parent / 'RP' / 'ui'
KNOWN = {
    'absorbs_input', 'activated', 'alignment', 'allow_clipping', 'allow_debug_missing_texture', 'alpha',
    'always_accepts_input', 'always_handle_controller_direction', 'always_handle_pointer', 'always_handle_scrolling',
    'always_listen_to_input', 'always_listening', 'always_rotate', 'anchor_from', 'anchor_to', 'anim_type',
    'animation_reset_name', 'anims', 'armor_trim_material', 'armor_trim_pattern', 'array_name', 'background_color',
    'background_control', 'background_hover_control', 'backup_font_type', 'banner', 'base_size', 'bilinear',
    'binding_collection_name', 'binding_collection_prefix', 'binding_condition', 'binding_name',
    'binding_name_override', 'binding_type', 'bindings', 'button', 'button_mappings', 'button_name',
    'button_up_right_of_first_refusal', 'cache_screen', 'camera_tilt_degrees', 'can_be_deselected', 'carousel_label',
    'cartography_table', 'checked_control', 'checked_hover_control', 'checked_locked_control',
    'checked_locked_hover_control', 'chest', 'classic_radio_button_state', 'clip', 'clip_direction', 'clip_offset',
    'clip_pixelperfect', 'clip_ratio', 'clip_state_change_event', 'clips_children', 'close_on_player_hurt',
    'collection_index', 'collection_name', 'collection_panel', 'color', 'color1', 'color2', 'constrain_to_rect',
    'consume_event', 'consume_hover_events', 'contained', 'control_ids', 'control_name', 'controls',
    'crafting_table', 'custom', 'default_control', 'default_focus_precedence', 'destroy_at_end', 'diamond',
    'disable_anim_fast_forward', 'draggable', 'dropdown', 'dropdown_area', 'dropdown_content_control',
    'dropdown_name', 'duration', 'easing', 'edit_box', 'emerald', 'enable_directional_toggling',
    'enable_profanity_filter', 'enable_scissor_test', 'enabled', 'enabled_newline', 'end_event', 'entity_type',
    'experimental_radio_button_state', 'factory', 'fill', 'flying_item_banner_colors', 'flying_item_banner_patterns',
    'flying_item_count', 'flying_item_custom_color', 'flying_item_destination_position_x',
    'flying_item_destination_position_y', 'flying_item_destination_scale', 'flying_item_id_aux',
    'flying_item_origin_position_x', 'flying_item_origin_position_y', 'flying_item_origin_scale',
    'focus_change_down', 'focus_change_left', 'focus_change_right', 'focus_change_up', 'focus_container',
    'focus_container_custom_down', 'focus_container_custom_left', 'focus_container_custom_right',
    'focus_container_custom_up', 'focus_enabled', 'focus_id_inside', 'focus_identifier', 'focus_magnet_enabled',
    'focus_mapping', 'focus_navigation_mode_down', 'focus_navigation_mode_left', 'focus_navigation_mode_right',
    'focus_navigation_mode_up', 'focus_wrap_enabled', 'follows_cursor', 'font_scale_factor', 'font_size',
    'font_type', 'force_render_below', 'force_texture_reload', 'force_update', 'fps', 'frame_count', 'frame_step',
    'from', 'from_button_id', 'gamepad_cursor', 'gamepad_cursor_deflection_mode', 'gesture_control_enabled',
    'gesture_tracking_button', 'gold_ingot', 'gradient_direction', 'grayscale', 'grid', 'grid_dimension_binding',
    'grid_dimensions', 'grid_fill_direction', 'grid_item', 'grid_item_template', 'grid_position',
    'grid_rescaling_type', 'handle_deselect', 'handle_select', 'hide_hyphen', 'hover_alpha', 'hover_color',
    'hover_control', 'hover_enabled', 'ignore_input_scope', 'ignored', 'image', 'inherit_max_sibling_height',
    'inherit_max_sibling_width', 'initial_button_slice', 'initial_uv', 'inline_modal', 'inner_radius',
    'input_mode_condition', 'input_panel', 'iron_ingot', 'is_durability', 'is_fixed_inventory', 'is_local',
    'is_modal', 'is_showing_menu', 'item_custom_color', 'item_id_aux', 'iterate_left_button_name',
    'iterate_right_button_name', 'jump_to_bottom_on_update', 'keep_ratio', 'label', 'layer', 'line_padding',
    'load_screen_immediately', 'localize', 'locked_alpha', 'locked_color', 'locked_control', 'loom',
    'low_frequency_rendering', 'mapping_type', 'max_length', 'max_size', 'maximum_grid_items',
    'min_seconds_between_plays', 'min_size', 'modal', 'modifications', 'name', 'netherite_ingot', 'next',
    'nineslice_size', 'notify_on_ellipses', 'offset', 'opacity_override', 'operation', 'orientation',
    'other_focus_container_name', 'outer_radius', 'panel', 'place_holder_control', 'play_event',
    'precached_grid_item_count', 'pressed_alpha', 'pressed_color', 'pressed_control', 'prevent_touch_input',
    'primary_color', 'priority', 'progress_control', 'progress_hover_control', 'propagate_alpha', 'property_bag',
    'radio_toggle_group', 'render_game_behind', 'render_only_when_topmost', 'renderer', 'reset_event', 'reset_group',
    'reset_on_focus_lost', 'resettable', 'resolve_sibling_scope', 'reversible', 'rotate_speed', 'rotation',
    'round_value', 'saddle', 'scale_from_starting_alpha', 'scope', 'screen', 'screen_draws_last',
    'screen_not_flushable', 'scroll_box_and_track_panel', 'scroll_content', 'scroll_report', 'scroll_speed',
    'scroll_view', 'scroll_view_port', 'scrollbar', 'scrollbar_box', 'scrollbar_touch_button', 'scrollbar_track',
    'scrollbar_track_button', 'secondary_color', 'selected', 'selection_wheel', 'send_telemetry', 'shadow',
    'should_be_skipped_during_automation', 'should_steal_mouse', 'size', 'slice_count', 'slider', 'slider_box',
    'slider_box_control', 'slider_collection_name', 'slider_deselected_button', 'slider_direction', 'slider_name',
    'slider_select_on_hover', 'slider_selected_button', 'slider_small_decrease_button',
    'slider_small_increase_button', 'slider_steps', 'slider_timeout', 'slider_track_button', 'sound_name',
    'sound_pitch', 'sound_volume', 'sounds', 'source_control_name', 'source_property_name', 'stack_panel',
    'start_event', 'starting_rotation', 'state_controls', 'stonecutter_block', 'tab', 'tab_control', 'tab_group',
    'tab_index', 'target_property_name', 'text', 'text_alignment', 'text_box_name', 'text_color', 'text_control',
    'text_edit_box_grid_collection_name', 'text_tts', 'text_type', 'texture', 'texture_file_system', 'tiled',
    'tiled_scale', 'timer_duration', 'to', 'to_button_id', 'toggle', 'toggle_default_state',
    'toggle_grid_collection_name', 'toggle_group_default_selected', 'toggle_group_forced_index', 'toggle_name',
    'toggle_off_button', 'toggle_on_button', 'toggle_on_hover', 'touch_mode', 'tts_control_header',
    'tts_control_type_order_priority', 'tts_ignore_count', 'tts_ignore_subsections', 'tts_index_priority',
    'tts_inherit_siblings', 'tts_name', 'tts_override_control_value', 'tts_play_on_unchanged_focus_control',
    'tts_section_header', 'tts_skip_message', 'tts_toggle_off', 'tts_toggle_on', 'tts_value_changed',
    'tts_value_order_priority', 'type', 'unchecked_control', 'unchecked_hover_control', 'unchecked_locked_control',
    'unchecked_locked_hover_control', 'use_anchored_offset', 'use_child_anchors', 'use_last_focus',
    'use_player_paperdoll', 'use_priority', 'use_selected_skin', 'use_skin_gui_scale', 'use_uuid', 'uv', 'uv_size',
    'value', 'variables', 'virtual_keyboard_buffer_control', 'visible', 'vr_mode', 'wrap', 'z_order', 'zip_folder',
}
BINDING_KEYS = {'binding_name', 'binding_name_override', 'binding_type', 'binding_collection_name', 'binding_condition',
                'source_control_name', 'source_property_name', 'target_property_name', 'resolve_sibling_scope'}


def compound(expr):
    """A text test (string subtraction) combined with or/and: on the phone such a test came out wrong."""
    return isinstance(expr, str) and " - '" in expr and (' or ' in expr or ' and ' in expr)


def walk(node, path, problems):
    if isinstance(node, dict) and node.get('binding_type') == 'view' and compound(node.get('source_property_name')):
        problems.append(f"{'/'.join(path)}: compound text test - nest one test per panel instead")
    if isinstance(node, list):
        for item in node:
            walk(item, path, problems)
        return
    if not isinstance(node, dict):
        return
    for key, value in node.items():
        name = key.split('@')[0]
        if key.startswith('$') or name in BINDING_KEYS:
            continue
        if isinstance(value, dict) and ('@' in key or 'type' in value or 'controls' in value or 'texture' in value or 'text' in value):
            walk(value, path + [name], problems)  # a child control
            continue
        if name not in KNOWN and re.match(r'^[a-z_0-9]+$', name) and path and path[-1] not in ('control_ids', 'value'):
            problems.append(f"{'/'.join(path)}: {name}")
        if isinstance(value, (dict, list)) and name != 'variables':
            walk(value, path + [name], problems)


def main():
    problems = []
    for f in sorted(UI.glob('*.json')):
        data = json.loads(f.read_text(encoding='utf-8'))
        for key, value in data.items():
            if key != 'namespace':
                walk(value, [f.name, key.split('@')[0]], problems)
    for p in problems:
        print('UI problem:', p)
    print(f'checked {len(list(UI.glob("*.json")))} UI files: {len(problems)} problems')
    sys.exit(1 if problems else 0)


if __name__ == '__main__':
    main()
