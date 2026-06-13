"use strict";

// Sundial options. Loads config from chrome.storage.local and writes on every change.
// Content scripts pick changes up live via storage.onChanged — no reload needed.

const DEF = { mode: "manual", enabled: false, start: "19:00", end: "07:00", affectDark: false };
const $ = (sel) => document.querySelector(sel);
const saved = $("#saved");
let savedTimer = null;

function flashSaved() {
  saved.hidden = false;
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => (saved.hidden = true), 1200);
}

function syncScheduleVisibility(mode) {
  $("#times").classList.toggle("hidden", mode !== "time");
}

function save(patch) {
  chrome.storage.local.set(patch, flashSaved);
}

function load() {
  chrome.storage.local.get(DEF, (cfg) => {
    const radio = document.querySelector(`input[name="mode"][value="${cfg.mode}"]`);
    if (radio) radio.checked = true;
    $("#start").value = cfg.start;
    $("#end").value = cfg.end;
    $("#affectDark").checked = !!cfg.affectDark;
    syncScheduleVisibility(cfg.mode);
  });
}

document.querySelectorAll('input[name="mode"]').forEach((el) =>
  el.addEventListener("change", () => {
    syncScheduleVisibility(el.value);
    save({ mode: el.value });
  })
);
$("#start").addEventListener("change", (e) => save({ start: e.target.value }));
$("#end").addEventListener("change", (e) => save({ end: e.target.value }));
$("#affectDark").addEventListener("change", (e) => save({ affectDark: e.target.checked }));

load();
