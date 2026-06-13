# Sundial

A lightweight Chrome/Arc extension that flips any web page between light and dark mode.
Click the pinned toolbar icon to toggle — or let it follow your system theme or a schedule.

## Features

- **One-click toggle** from the pinned toolbar icon (or the `⌃⇧D` shortcut).
- **Three modes** (set in Options):
  - **Manual** — you toggle it (default).
  - **Follow system** — matches your OS light/dark setting, live.
  - **Scheduled** — dark between a start and end time you pick.
- **Tuned for looks** — softened inversion (no harsh pure black/white), images and video
  stay true-color, and pages that are *already* dark are left alone.
- **Lightweight** — one stylesheet, no libraries, and a single permission (`storage`).

## Install in Arc (load unpacked)

1. Generate the icons once (Python 3, no dependencies):
   ```sh
   python3 scripts/gen-icons.py
   ```
2. Open `arc://extensions` and turn on **Developer mode** (top-right).
3. Click **Load unpacked** and select this `Sundial` folder.
4. Click the toolbar puzzle icon and **pin** Sundial so its icon is always visible.

Same steps work in Chrome via `chrome://extensions`.

## Use

- **Click the icon** (or press `⌃⇧D`) to toggle dark on/off. The icon shows a ☀ when light,
  🌙 when dark. Clicking always switches to **Manual** mode ("I want it this way now").
- **Change modes / set a schedule:** right-click the icon → **Options** (or
  `arc://extensions` → Sundial → *Details* → *Extension options*).

## How it works

A single boolean-plus-config lives in `chrome.storage.local`. A content script on every page
reads it, computes whether *this* page should be dark for the active mode, and toggles a
`sundial-on` class on `<html>`. The declared `sundial.css` then applies a tuned
`invert(1) hue-rotate(180deg) contrast(0.9)` filter, re-inverting real media so photos and
video look normal. Because every page listens for `storage.onChanged`, flipping the switch
updates all open tabs at once.

## Known limitations

- Colors are inverted algorithmically; most pages look great, a few designs may look slightly off.
- Class-based CSS background images (vs `<img>` / inline styles) can't be reliably re-inverted,
  so some decorative backgrounds may appear as a color negative.
- Content inside cross-origin iframes keeps its original colors (top frame only, by design).
- Scheduled boundary flips happen for live and refocused tabs; a fully backgrounded tab updates
  when you return to it.
- A brief flash is possible on first paint when dark is active (the saved setting is read async).
- Some sites with `position: fixed` headers may show minor positioning quirks from the
  page-wide filter.

## Files

| File | Role |
| --- | --- |
| `manifest.json` | MV3 config, permissions, content script, action, options, shortcut |
| `content.js` | Computes effective state per mode; toggles the `sundial-on` class |
| `background.js` | Handles the icon click; keeps each tab's icon in sync |
| `sundial.css` | The tuned dark-mode invert rules |
| `options.html` / `options.js` / `options.css` | Settings page (mode + schedule) |
| `scripts/gen-icons.py` | Regenerates the sun/moon PNG icons |
