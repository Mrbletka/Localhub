"""Localhub - license key activation menu (terminal UI).

GUI only: the actual key check lives in `verify_key()` below and is a stub.
Swap it for a real call when the backend exists.

Run:
    pip install -r requirements.txt
    python -m keymenu
"""

from __future__ import annotations

import asyncio
import colorsys
import hashlib
import platform
import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from rich.text import Text
from textual import events, on
from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.color import Gradient
from textual.containers import Center, Horizontal, Vertical
from textual.message import Message
from textual.reactive import reactive
from textual.screen import ModalScreen
from textual.theme import Theme
from textual.widgets import Button, Footer, Input, Label, ProgressBar, Rule, Static

SEGMENTS = 5
SEGMENT_LEN = 5
KEY_LEN = SEGMENTS * SEGMENT_LEN
SPINNER = "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏"

LOGO = """\
██╗      ██████╗  ██████╗ █████╗ ██╗     ██╗  ██╗██╗   ██╗██████╗
██║     ██╔═══██╗██╔════╝██╔══██╗██║     ██║  ██║██║   ██║██╔══██╗
██║     ██║   ██║██║     ███████║██║     ███████║██║   ██║██████╔╝
██║     ██║   ██║██║     ██╔══██║██║     ██╔══██║██║   ██║██╔══██╗
███████╗╚██████╔╝╚██████╗██║  ██║███████╗██║  ██║╚██████╔╝██████╔╝
╚══════╝ ╚═════╝  ╚═════╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚═════╝"""

LOGO_COMPACT = "◆ L O C A L H U B ◆"

# Cyclic gradient the logo and key meter flow through.
BRAND_STOPS = ["#7C5CFF", "#00D4FF", "#3DFFB0", "#00D4FF", "#7C5CFF"]

LOCALHUB_THEME = Theme(
    name="localhub",
    primary="#7C5CFF",
    secondary="#00D4FF",
    accent="#3DFFB0",
    foreground="#E6E8F2",
    background="#0B0D17",
    surface="#12152A",
    panel="#1A1E3A",
    success="#3DFFB0",
    warning="#FFB547",
    error="#FF5C7A",
    dark=True,
    variables={
        "footer-key-foreground": "#00D4FF",
        "input-selection-background": "#7C5CFF 40%",
    },
)

THEME_CYCLE = ["localhub", "tokyo-night", "catppuccin-mocha", "nord", "dracula", "gruvbox"]


# --------------------------------------------------------------------------- #
# Backend hook (stub)
# --------------------------------------------------------------------------- #


@dataclass
class ActivationResult:
    ok: bool
    message: str
    plan: str = ""
    seats: str = ""
    expires: str = ""


STEPS = [
    "Validating key format",
    "Securing channel",
    "Verifying signature",
    "Binding to this device",
    "Unlocking services",
]


async def verify_key(key: str, step: int) -> ActivationResult | None:
    """Run one activation step. Return a result to finish early, else None.

    Demo behaviour: keys ending in 00000 are rejected at the signature step,
    so the failure state can be previewed.
    """
    await asyncio.sleep(0.45 + 0.15 * step)
    if step == 2 and key.endswith("00000"):
        return ActivationResult(False, "Signature mismatch - this key was not issued by Localhub.")
    if step == len(STEPS) - 1:
        return ActivationResult(True, "Activated", plan="Pro", seats="5 devices", expires="30 Sep 2027")
    return None


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #


def _hex_to_rgb(value: str) -> tuple[float, float, float]:
    value = value.lstrip("#")
    return tuple(int(value[i : i + 2], 16) / 255 for i in (0, 2, 4))  # type: ignore[return-value]


def brand_color(t: float) -> str:
    """Colour at position t (0..1, wraps) along the brand gradient."""
    t %= 1.0
    scaled = t * (len(BRAND_STOPS) - 1)
    i = int(scaled)
    frac = scaled - i
    a = _hex_to_rgb(BRAND_STOPS[i])
    b = _hex_to_rgb(BRAND_STOPS[min(i + 1, len(BRAND_STOPS) - 1)])
    r, g, bl = (a[k] + (b[k] - a[k]) * frac for k in range(3))
    return "#{:02x}{:02x}{:02x}".format(int(r * 255), int(g * 255), int(bl * 255))


def device_id() -> str:
    digest = hashlib.sha256(platform.node().encode()).hexdigest().upper()
    return f"LH-{digest[:4]}-{digest[4:8]}"


def mask_key(key: str) -> str:
    key = key.replace("-", "")
    parts = [key[i : i + SEGMENT_LEN] for i in range(0, KEY_LEN, SEGMENT_LEN)]
    return "-".join([parts[0], *["•••••"] * (SEGMENTS - 2), parts[-1]])


# --------------------------------------------------------------------------- #
# Widgets
# --------------------------------------------------------------------------- #


class GradientLogo(Static):
    """The wordmark, with a slow flowing gradient."""

    phase = reactive(0.0)

    def on_mount(self) -> None:
        self.set_interval(1 / 20, self._tick)

    def _tick(self) -> None:
        self.phase = (self.phase + 0.006) % 1.0

    def render(self) -> Text:
        art = LOGO if self.app.size.width >= 76 and self.app.size.height >= 34 else LOGO_COMPACT
        lines = art.splitlines()
        width = max(len(line) for line in lines)
        text = Text(justify="center")
        for y, line in enumerate(lines):
            for x, ch in enumerate(line):
                shade = brand_color(x / width * 0.8 + y * 0.02 - self.phase)
                # Box-drawing shadow glyphs get a dimmer tone for depth.
                style = f"bold {shade}" if ch == "█" or ch not in "╗╝╚╔═║" else f"{shade} dim"
                text.append(ch, style)
            if y < len(lines) - 1:
                text.append("\n")
        return text


class KeySegment(Input):
    """One 5-character block of the product key."""

    class Paste(Message):
        def __init__(self, segment: KeySegment, text: str) -> None:
            self.segment = segment
            self.text = text
            super().__init__()

    class BackspaceAtStart(Message):
        def __init__(self, segment: KeySegment) -> None:
            self.segment = segment
            super().__init__()

    def __init__(self, index: int) -> None:
        super().__init__(
            placeholder="·····",
            max_length=SEGMENT_LEN,
            restrict=r"[A-Za-z0-9]*",
            id=f"seg-{index}",
            classes="segment",
            select_on_focus=False,
        )
        self.index = index

    def _on_paste(self, event: events.Paste) -> None:
        # Let the form spread pasted keys across all segments.
        event.stop()
        event.prevent_default()
        self.post_message(self.Paste(self, event.text))

    def action_delete_left(self) -> None:
        if self.cursor_position == 0 and self.selection.is_empty:
            self.post_message(self.BackspaceAtStart(self))
        else:
            super().action_delete_left()

    def restricted(self) -> None:
        # No terminal bell; flash the block instead.
        self.add_class("-flash")
        self.set_timer(0.18, lambda: self.remove_class("-flash"))


class KeyMeter(Static):
    """25-cell fill meter under the key."""

    filled = reactive(0)
    phase = reactive(0.0)

    def on_mount(self) -> None:
        self.set_interval(1 / 20, lambda: setattr(self, "phase", (self.phase + 0.01) % 1.0))

    def render(self) -> Text:
        text = Text()
        for i in range(KEY_LEN):
            if i < self.filled:
                text.append("▰", brand_color(i / KEY_LEN * 0.6 - self.phase))
            else:
                text.append("▱", "#3A3F66")
            if i % SEGMENT_LEN == SEGMENT_LEN - 1 and i < KEY_LEN - 1:
                text.append(" ")
        text.append(f"   {self.filled:>2}/{KEY_LEN}", "bold" if self.filled == KEY_LEN else "dim")
        return text


class StatusLine(Static):
    def show(self, kind: str, message: str) -> None:
        icons = {"idle": "○", "typing": "◐", "ready": "●", "error": "✕"}
        self.set_classes(f"status -{kind}")
        self.update(Text.assemble((f"{icons[kind]}  ", "bold"), message))


class TopBar(Horizontal):
    def compose(self) -> ComposeResult:
        yield Static(Text.assemble(("◆ ", "bold #7C5CFF"), ("LOCALHUB", "bold"), ("  License Center", "dim")), id="brand")
        yield Static(id="clock")

    def on_mount(self) -> None:
        self._tick()
        self.set_interval(1, self._tick)

    def _tick(self) -> None:
        now = datetime.now().strftime("%H:%M:%S")
        self.query_one("#clock", Static).update(
            Text.assemble(("● ", "#3DFFB0"), ("secure  ", "dim"), (now, "bold"))
        )


# --------------------------------------------------------------------------- #
# Activation modal
# --------------------------------------------------------------------------- #


class StepRow(Static):
    state = reactive("pending")
    frame = reactive(0)
    elapsed = reactive("")

    def __init__(self, label: str) -> None:
        super().__init__(classes="step")
        self.label = label

    def render(self) -> Text:
        icon, style = {
            "pending": ("○", "#3A3F66"),
            "running": (SPINNER[self.frame % len(SPINNER)], "bold #00D4FF"),
            "done": ("✓", "bold #3DFFB0"),
            "failed": ("✕", "bold #FF5C7A"),
        }[self.state]
        label_style = "dim" if self.state == "pending" else ""
        return Text.assemble((f" {icon}  ", style), (self.label, label_style), ("  " + self.elapsed, "dim"))


class ActivationScreen(ModalScreen[bool]):
    BINDINGS = [Binding("escape", "back", "Back")]

    def __init__(self, key: str) -> None:
        super().__init__()
        self.key = key
        self.finished = False

    def compose(self) -> ComposeResult:
        with Vertical(id="act-card"):
            yield Label("Activating", id="act-title")
            yield Label(Text.assemble(("Key  ", "dim"), (mask_key(self.key), "bold")), id="act-key")
            yield Rule(line_style="heavy")
            for label in STEPS:
                yield StepRow(label)
            yield ProgressBar(
                total=len(STEPS),
                show_eta=False,
                id="act-progress",
                gradient=Gradient.from_colors("#7C5CFF", "#00D4FF", "#3DFFB0"),
            )
            yield Static(id="act-result")
            with Horizontal(id="act-buttons"):
                yield Button("Try again", id="retry", variant="error")
                yield Button("Continue  ⏎", id="continue", variant="success")

    def on_mount(self) -> None:
        self.query_one("#act-buttons").display = False
        self.run_worker(self._activate(), exclusive=True)

    async def _activate(self) -> None:
        rows = list(self.query(StepRow))
        progress = self.query_one(ProgressBar)
        for i, row in enumerate(rows):
            row.state = "running"
            spin = self.set_interval(0.08, lambda r=row: setattr(r, "frame", r.frame + 1))
            started = asyncio.get_running_loop().time()
            result = await verify_key(self.key, i)
            spin.stop()
            row.elapsed = f"{(asyncio.get_running_loop().time() - started) * 1000:.0f} ms"
            if result is not None and not result.ok:
                row.state = "failed"
                self._finish(result)
                return
            row.state = "done"
            progress.advance(1)
            if result is not None:
                self._finish(result)
                return

    def _finish(self, result: ActivationResult) -> None:
        self.finished = True
        out = self.query_one("#act-result", Static)
        title = self.query_one("#act-title", Label)
        self.query_one("#act-buttons").display = True
        self.query_one("#retry").display = not result.ok
        self.query_one("#continue").display = result.ok
        if result.ok:
            self.add_class("-success")
            title.update("✓  Localhub is activated")
            grid = Text()
            for name, value in (("Plan", result.plan), ("Seats", result.seats), ("Renews", result.expires), ("Device", device_id())):
                grid.append(f"{name:<8}", "dim")
                grid.append(f"{value}\n", "bold")
            out.update(grid)
            self.query_one("#continue", Button).focus()
        else:
            self.add_class("-failed")
            title.update("✕  Activation failed")
            out.update(Text(result.message, "#FF5C7A"))
            self.query_one("#retry", Button).focus()

    @on(Button.Pressed, "#retry")
    def action_back(self) -> None:
        self.dismiss(False)

    @on(Button.Pressed, "#continue")
    def _continue(self) -> None:
        self.dismiss(True)


# --------------------------------------------------------------------------- #
# App
# --------------------------------------------------------------------------- #


class KeyMenuApp(App[str | None]):
    """Returns the activated key from `run()`, or None if the user quit."""

    CSS_PATH = Path(__file__).with_name("app.tcss")
    TITLE = "Localhub - Activate"
    HORIZONTAL_BREAKPOINTS = [(0, "-narrow"), (80, "-wide")]

    BINDINGS = [
        Binding("enter", "activate", "Activate", priority=True),
        Binding("ctrl+r", "reveal", "Reveal/Hide"),
        Binding("ctrl+t", "cycle_theme", "Theme"),
        Binding("escape", "clear", "Clear"),
        Binding("ctrl+q", "quit", "Quit", priority=True),
    ]

    revealed = reactive(True)

    def compose(self) -> ComposeResult:
        yield TopBar(id="topbar")
        with Vertical(id="body"):
            yield GradientLogo(id="logo")
            yield Label("a local hub for services", id="tagline")
            with Center():
                with Vertical(id="card"):
                    yield Label("PRODUCT KEY", classes="eyebrow")
                    with Horizontal(id="segments"):
                        for i in range(SEGMENTS):
                            yield KeySegment(i)
                            if i < SEGMENTS - 1:
                                yield Static("─", classes="dash")
                    yield KeyMeter(id="meter")
                    yield StatusLine(id="status")
                    yield Rule(id="card-rule")
                    yield Static(self._device_text(), id="device")
                    with Horizontal(id="actions"):
                        yield Button("Clear", id="clear", variant="default", compact=True)
                        yield Button("Activate  ⏎", id="activate", variant="primary", compact=True)
        yield Footer()

    def on_mount(self) -> None:
        self.register_theme(LOCALHUB_THEME)
        self.theme = "localhub"
        card = self.query_one("#card")
        card.border_title = " Activate Localhub "
        card.border_subtitle = " XXXXX-XXXXX-XXXXX-XXXXX-XXXXX "
        self._refresh_state()
        self.segments[0].focus()

    # -- state ------------------------------------------------------------- #

    @property
    def segments(self) -> list[KeySegment]:
        return list(self.query(KeySegment))

    @property
    def key(self) -> str:
        return "-".join(s.value for s in self.segments)

    @property
    def raw(self) -> str:
        return "".join(s.value for s in self.segments)

    def _device_text(self) -> Text:
        return Text.assemble(
            ("Device  ", "dim"), (device_id(), "bold"),
            ("   ·   ", "dim"),
            (f"{platform.system()} {platform.machine()}", ""),
            ("   ·   ", "dim"),
            ("offline-ready", "dim italic"),
        )

    def _refresh_state(self) -> None:
        raw = self.raw
        self.query_one(KeyMeter).filled = len(raw)
        for seg in self.segments:
            seg.set_class(len(seg.value) == SEGMENT_LEN, "-complete")
            seg.remove_class("-error")
        status = self.query_one(StatusLine)
        activate = self.query_one("#activate", Button)
        activate.disabled = len(raw) != KEY_LEN
        if not raw:
            status.show("idle", "Type or paste your 25-character key - it splits itself")
        elif len(raw) < KEY_LEN:
            status.show("typing", f"{KEY_LEN - len(raw)} characters to go")
        else:
            status.show("ready", "Key format looks good - press Enter to activate")

    def _fill(self, raw: str, focus_at: int | None = None) -> None:
        raw = re.sub(r"[^A-Z0-9]", "", raw.upper())[:KEY_LEN]
        for i, seg in enumerate(self.segments):
            with seg.prevent(Input.Changed):
                seg.value = raw[i * SEGMENT_LEN : (i + 1) * SEGMENT_LEN]
        pos = min(len(raw) if focus_at is None else focus_at, KEY_LEN)
        idx = min(pos // SEGMENT_LEN, SEGMENTS - 1)
        target = self.segments[idx]
        target.focus()
        target.cursor_position = pos - idx * SEGMENT_LEN
        self._refresh_state()

    # -- events ------------------------------------------------------------ #

    @on(Input.Changed, ".segment")
    def _on_segment_changed(self, event: Input.Changed) -> None:
        seg = event.input
        assert isinstance(seg, KeySegment)
        upper = event.value.upper()
        if upper != event.value:
            cursor = seg.cursor_position
            seg.value = upper
            seg.cursor_position = cursor
            return
        if len(upper) == SEGMENT_LEN and seg.cursor_position == SEGMENT_LEN and seg.index < SEGMENTS - 1:
            nxt = self.segments[seg.index + 1]
            nxt.focus()
            nxt.cursor_position = 0
        self._refresh_state()

    @on(KeySegment.Paste)
    def _on_paste(self, event: KeySegment.Paste) -> None:
        clean = re.sub(r"[^A-Za-z0-9]", "", event.text)
        if len(clean) >= KEY_LEN:
            self._fill(clean)
            return
        seg = event.segment
        before = "".join(s.value for s in self.segments[: seg.index]) + seg.value[: seg.cursor_position]
        after = seg.value[seg.cursor_position :] + "".join(s.value for s in self.segments[seg.index + 1 :])
        self._fill(before + clean + after, focus_at=len(before) + len(clean))

    @on(KeySegment.BackspaceAtStart)
    def _on_backspace_at_start(self, event: KeySegment.BackspaceAtStart) -> None:
        if event.segment.index == 0:
            return
        prev = self.segments[event.segment.index - 1]
        prev.focus()
        prev.cursor_position = len(prev.value)
        prev.action_delete_left()

    @on(Button.Pressed, "#activate")
    def _pressed_activate(self) -> None:
        self.action_activate()

    @on(Button.Pressed, "#clear")
    def _pressed_clear(self) -> None:
        self.action_clear()

    # -- actions ----------------------------------------------------------- #

    def action_activate(self) -> None:
        if isinstance(self.screen, ActivationScreen):
            if self.screen.finished:
                self.screen.query_one("#continue" if self.screen.has_class("-success") else "#retry", Button).press()
            return
        if len(self.raw) != KEY_LEN:
            self._reject(f"Key is incomplete - {KEY_LEN - len(self.raw)} characters missing")
            return
        key = self.key

        def done(ok: bool | None) -> None:
            if ok:
                self.exit(key)
            else:
                self._reject("Activation was not completed - check the key and try again")

        self.push_screen(ActivationScreen(key), done)

    def action_clear(self) -> None:
        if isinstance(self.screen, ActivationScreen):
            return
        self._fill("", focus_at=0)

    def action_reveal(self) -> None:
        self.revealed = not self.revealed
        for seg in self.segments:
            seg.password = not self.revealed
        self.notify("Key visible" if self.revealed else "Key hidden", timeout=1.5)

    def action_cycle_theme(self) -> None:
        current = THEME_CYCLE.index(self.theme) if self.theme in THEME_CYCLE else -1
        self.theme = THEME_CYCLE[(current + 1) % len(THEME_CYCLE)]
        self.notify(f"Theme  ·  {self.theme}", timeout=1.5)

    def _reject(self, message: str) -> None:
        self.query_one(StatusLine).show("error", message)
        for seg in self.segments:
            if len(seg.value) < SEGMENT_LEN:
                seg.add_class("-error")
        card = self.query_one("#card")
        for n, dx in enumerate((3, -3, 2, -2, 1, 0)):
            self.set_timer(0.045 * (n + 1), lambda dx=dx: setattr(card.styles, "offset", (dx, 0)))
        first_gap = next((s for s in self.segments if len(s.value) < SEGMENT_LEN), self.segments[0])
        first_gap.focus()


def main() -> None:
    key = KeyMenuApp().run()
    if key:
        print(f"Activated: {mask_key(key)}")


if __name__ == "__main__":
    main()
