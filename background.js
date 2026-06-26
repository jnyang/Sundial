"use strict";

// Sundial service worker. Two jobs:
//   1. Handle the toolbar click / keyboard shortcut -> take manual control and flip intent.
//   2. Keep each tab's toolbar icon (sun/moon) in sync with how its page actually looks.

function iconPaths(name) {
  return {
    16: `icons/${name}-16.png`,
    32: `icons/${name}-32.png`,
    48: `icons/${name}-48.png`,
    128: `icons/${name}-128.png`,
  };
}

function setIcon(tabId, dark) {
  const name = dark ? "moon" : "sun";
  chrome.action.setIcon({ tabId, path: iconPaths(name) }).catch(() => {});
  chrome.action
    .setTitle({
      tabId,
      title: dark ? "Sundial — page is dark (click to toggle)" : "Sundial — page is light (click to toggle)",
    })
    .catch(() => {});
}

// Pages report whether they currently look dark; reflect it on that tab's icon.
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (sender.tab && msg && typeof msg.dark === "boolean") {
    setIcon(sender.tab.id, msg.dark);
  }
});

// Click / shortcut: switch to manual control and flip the user's stored intent.
// Read straight from storage (not a per-tab cache) so this can't go stale —
// neither from the service worker idling out nor from the page's appearance
// (which, with affectDark off, can stay unchanged across a toggle).
chrome.action.onClicked.addListener(async () => {
  const { enabled } = await chrome.storage.local.get({ enabled: false });
  await chrome.storage.local.set({ mode: "manual", enabled: !enabled });
});
