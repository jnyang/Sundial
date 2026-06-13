"use strict";

// Sundial service worker. Two jobs:
//   1. Handle the toolbar click / keyboard shortcut -> take manual control and flip dark.
//   2. Keep each tab's toolbar icon (sun/moon) in sync with what its page reports.

const tabEffective = new Map(); // tabId -> last reported effective state (ephemeral)

function iconPaths(name) {
  return {
    16: `icons/${name}-16.png`,
    32: `icons/${name}-32.png`,
    48: `icons/${name}-48.png`,
    128: `icons/${name}-128.png`,
  };
}

function setIcon(tabId, on) {
  const name = on ? "moon" : "sun";
  chrome.action.setIcon({ tabId, path: iconPaths(name) }).catch(() => {});
  chrome.action
    .setTitle({
      tabId,
      title: on ? "Sundial — dark mode ON (click for light)" : "Sundial — toggle dark mode",
    })
    .catch(() => {});
}

// Pages report their effective dark state; reflect it on that tab's icon.
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (sender.tab && msg && typeof msg.effective === "boolean") {
    tabEffective.set(sender.tab.id, msg.effective);
    setIcon(sender.tab.id, msg.effective);
  }
});

// Click / shortcut: switch to manual control and flip the current effective state.
chrome.action.onClicked.addListener(async (tab) => {
  let base = tabEffective.get(tab.id);
  if (typeof base !== "boolean") {
    const { enabled } = await chrome.storage.local.get({ enabled: false });
    base = enabled; // no report yet (e.g. just-loaded tab) — fall back to stored value
  }
  await chrome.storage.local.set({ mode: "manual", enabled: !base });
});

// Memory hygiene (works without the "tabs" permission — tabId only).
chrome.tabs.onRemoved.addListener((tabId) => tabEffective.delete(tabId));
