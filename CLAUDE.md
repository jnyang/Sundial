# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Sundial is a Manifest V3 Chrome/Arc extension that toggles any web page between light and dark
mode via a page-wide CSS invert filter. It is plain JS/CSS — **no build step, no bundler, no npm,
no test suite, no dependencies.** The repo files *are* the extension.

## Commands

- **Run / debug:** load unpacked. `arc://extensions` (or `chrome://extensions`) → enable Developer
  mode → **Load unpacked** → select this folder. After editing `content.js`/`background.js`/CSS,
  hit the reload icon on the extension card, then hard-refresh (`Cmd+Shift+R`) any open tab to
  re-inject the content script.
- **Regenerate icons:** `python3 scripts/gen-icons.py` (stdlib only, no Pillow). Only needed if you
  change the icon glyphs/colors; the committed PNGs in `icons/` are otherwise fine.
- **No automated tests exist.** Verify changes manually by loading unpacked and exercising the page.
  Toggle on a light site, a natively-dark site (e.g. YouTube), and a site that ships
  `<picture><img>` with image transitions (e.g. patagonia.ca) — these three cover the load-bearing
  edge cases below.

## Architecture

State lives in one place: **`chrome.storage.local`** holding
`{ mode, enabled, start, end, affectDark }`. Three actors read/write it; `storage.onChanged` fans
every change out to all tabs, so flipping the switch updates every open page at once.

- **`content.js`** runs on `<all_urls>` at `document_start` and is the single source of truth for
  "is this page dark right now." It computes the effective state and toggles a `sundial-on` class
  on `<html>`. The declared `sundial.css` is inert until that class appears.
- **`sundial.css`** applies `invert(1) hue-rotate(180deg) contrast(0.9)` to `:root.sundial-on`, then
  *counter-inverts* media so photos/video land back at true colors.
- **`background.js`** (service worker) does two things: on toolbar click / `⌃⇧D`, it flips intent by
  writing `{ mode: "manual", enabled: !enabled }`; and it sets each tab's sun/moon icon from a
  `{ dark }` message the content script sends.
- **`options.html`/`options.js`** is the settings page; it only reads/writes the same storage keys.

The DEF config object (`{ mode:"manual", enabled:false, start:"19:00", end:"07:00", affectDark:false }`)
is duplicated in `content.js`, `options.js`. Keep them in sync if you add a setting.

### State model

`mode` is `"manual" | "os" | "time"`. `wanted()` derives the desired state (`enabled` /
`prefers-color-scheme` / clock range). Final decision: `on = wanted() && (affectDark || !alreadyDark())`
— i.e. Sundial backs off pages that are *already* dark unless `affectDark` is set. `"time"` mode
re-runs `render()` via a `setTimeout` to the next schedule boundary and on `visibilitychange`.

### Non-obvious invariants (these are easy to break)

- **Icon reflects appearance, not activity.** The content script reports `dark = (nativeDark !== on)`
  (an XOR), so the toolbar glyph matches how the page actually *looks*, not whether Sundial is the
  one inverting it. `background.js` reads `enabled` straight from storage on click (never a per-tab
  cache) so the toggle can't go stale.
- **Never counter-invert both a wrapper and the element it contains.** Two nested counter-inverts
  cancel (`invert∘invert = identity`), which lets the root filter turn the image into a negative.
  This is why `<picture>` is deliberately *absent* from the media selector in `sundial.css` — only
  the leaf `<img>` that paints gets the filter. Adding a container selector that can wrap media will
  reintroduce inverted images.
- **`render()` ordering is deliberate and must stay synchronous.** It: disconnects `themeObserver`
  → adds `sundial-switching` (transitions off) → removes `sundial-on` so `alreadyDark()` can read
  the page's *real* background (the `sundial-on` rule forces `<html>` white, which would otherwise
  mask it) → measures → toggles `sundial-on` → forces a reflow (`void root.offsetWidth`) → removes
  `sundial-switching` → reconnects the observer. The observer **must** be disconnected across our
  own class mutations or it re-invokes `render()` in an infinite loop.
- **Transition suppression has two halves.** `transition: none` under `:root.sundial-on` keeps the
  invert from animating in while dark is on; the `sundial-switching` class (added/removed within the
  one synchronous `render()`, so it never reaches a paint) keeps turning dark *off* from letting the
  page's own `transition: filter` fade from inverted back to normal.
- **`themeObserver` watches `<html>`/`<body>` attribute changes** to catch sites that apply their
  own dark theme via JS well after load (YouTube flips a `dark` attribute ~1s in), re-running the
  already-dark check whenever the page's theme machinery moves.

### Constraints

- Only the `storage` permission — no `tabs`, `scripting`, `activeTab`, or `alarms`. Solutions must
  work within that (e.g. the icon is driven by content-script messages, not tab queries).
- Top frame only; cross-origin iframe contents keep their original colors by design.
- Class-based CSS `background-image`s can't be reliably reached by the static selector (only `<img>`
  and inline `style="background-image"` are), so some decorative backgrounds may show as negatives.
