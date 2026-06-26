"use strict";

// Sundial content script — the single source of truth for "is this page dark right now".
// It reads config, computes the effective state for the active mode, and toggles the
// `sundial-on` class on <html>. The declared stylesheet (sundial.css) does the rest.

const DEF = { mode: "manual", enabled: false, start: "19:00", end: "07:00", affectDark: false };
let cfg = { ...DEF };
let timer = null;

const mq = matchMedia("(prefers-color-scheme: dark)");

// --- time helpers -----------------------------------------------------------
function hhmm(s) {
  const [h, m] = String(s).split(":").map(Number);
  return (h || 0) + (m || 0) / 60;
}
function nowHours() {
  const n = new Date();
  return n.getHours() + n.getMinutes() / 60 + n.getSeconds() / 3600;
}
function inRange(start, end) {
  const s = hhmm(start), e = hhmm(end), h = nowHours();
  if (s === e) return false; // empty/zero-length range
  return s < e ? (h >= s && h < e) : (h >= s || h < e); // handle overnight ranges
}
function msToNextBoundary(start, end) {
  const s = hhmm(start), e = hhmm(end), h = nowHours();
  const until = (b) => { let d = b - h; while (d <= 0) d += 24; return d; }; // hours ahead, wrapped
  const nextHrs = Math.min(until(s), until(e));
  return Math.max(1000, Math.round(nextHrs * 3600 * 1000));
}

// --- state ------------------------------------------------------------------
function wanted() {
  if (cfg.mode === "os") return mq.matches;
  if (cfg.mode === "time") return inRange(cfg.start, cfg.end);
  return !!cfg.enabled; // manual
}

// Skip pages that are already dark so we don't turn a nice dark theme bright/wrong.
function bgLuminance(el) {
  if (!el) return null;
  const bg = getComputedStyle(el).backgroundColor;
  const m = bg && bg.match(/[\d.]+/g);
  if (!m || m.length < 3) return null;
  const alpha = m.length >= 4 ? parseFloat(m[3]) : 1;
  if (alpha < 0.5) return null; // mostly transparent → inconclusive, try the next candidate
  const [r, g, b] = m.map(Number);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b; // perceived luminance
}
function alreadyDark() {
  try {
    const root = document.documentElement;
    const body = document.body;

    // A page can declare `color-scheme: dark` (or `light dark`) and let the
    // browser paint a dark canvas for the OS's current preference — with no
    // explicit background-color anywhere for us to detect. Check that first.
    const scheme = (getComputedStyle(root).colorScheme || "normal").toLowerCase();
    const supportsDark = scheme.includes("dark");
    const supportsLight = scheme.includes("light");
    if (supportsDark && (!supportsLight || mq.matches)) return true;

    // Otherwise fall back to explicit backgrounds: body, then <html>, then the
    // page's main wrapper div — many SPAs (#root/#app/#__next) paint the real
    // background there and leave <body> itself transparent.
    const candidates = [body, root, body && body.firstElementChild];
    for (const el of candidates) {
      const lum = bgLuminance(el);
      if (lum !== null) return lum < 80; // perceived luminance threshold
    }
    return false;
  } catch (e) {
    return false;
  }
}

function reportIcon(on) {
  try {
    const p = chrome.runtime.sendMessage({ effective: on });
    if (p && typeof p.catch === "function") p.catch(() => {});
  } catch (e) {
    /* extension context may be gone during reloads — ignore */
  }
}

function render() {
  const on = wanted() && (cfg.affectDark || !alreadyDark());
  const root = document.documentElement;
  if (root) root.classList.toggle("sundial-on", on);
  reportIcon(on);

  clearTimeout(timer);
  if (cfg.mode === "time") {
    timer = setTimeout(render, msToNextBoundary(cfg.start, cfg.end));
  }
}

// Many sites apply their own dark theme by flipping a class/attribute on
// <html> or <body> from JS well after DOMContentLoaded (e.g. YouTube adds a
// `dark` attribute ~1s in). Watching for that directly — rather than relying
// on a couple of fixed checkpoints — means alreadyDark() gets re-evaluated
// the moment a site's own theme actually lands, however long that takes.
const themeObserver = new MutationObserver(render);
function watchTheme() {
  if (document.documentElement) themeObserver.observe(document.documentElement, { attributes: true });
  if (document.body) themeObserver.observe(document.body, { attributes: true });
}

// --- wiring -----------------------------------------------------------------
chrome.storage.local.get(DEF, (r) => {
  cfg = Object.assign({}, DEF, r);
  watchTheme();
  render();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  for (const k in changes) cfg[k] = changes[k].newValue;
  render();
});

mq.addEventListener("change", () => {
  if (cfg.mode === "os") render();
});

// alreadyDark() needs <body>; at document_start it isn't there yet, so re-check
// (and start observing it) once it exists.
document.addEventListener("DOMContentLoaded", () => {
  watchTheme();
  render();
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) render(); // catches scheduled boundaries crossed while backgrounded
});
