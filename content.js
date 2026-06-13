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
function alreadyDark() {
  try {
    const el = document.body || document.documentElement;
    if (!el) return false;
    const bg = getComputedStyle(el).backgroundColor;
    const m = bg && bg.match(/[\d.]+/g);
    if (!m || m.length < 3) return false;
    const alpha = m.length >= 4 ? parseFloat(m[3]) : 1;
    if (alpha < 0.5) return false; // mostly transparent → can't tell, treat as light
    const [r, g, b] = m.map(Number);
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) < 80; // perceived luminance threshold
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

// --- wiring -----------------------------------------------------------------
chrome.storage.local.get(DEF, (r) => {
  cfg = Object.assign({}, DEF, r);
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

// alreadyDark() needs <body>; at document_start it isn't there yet, so re-check later.
document.addEventListener("DOMContentLoaded", render);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) render(); // catches scheduled boundaries crossed while backgrounded
});
