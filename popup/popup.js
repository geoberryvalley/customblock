

const enabledToggle = document.getElementById('enabled');
const countDisplay = document.getElementById('count');

const CATEGORY_KEYS = [];
const CATEGORY_DEFAULTS = Object.fromEntries(CATEGORY_KEYS.map(k => [k, true]));
const SYNC_DEFAULTS = { enabled: true, };


async function getPageKey() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url) return new URL(tab.url).hostname + new URL(tab.url).pathname;
  } catch {}
  return null;
}

chrome.storage.sync.get(SYNC_DEFAULTS, (s) => {
  enabledToggle.checked = s.enabled;
});

chrome.runtime.sendMessage({ type: 'GET_COUNT' }, (r) => {
  if (r?.totalReplaced) countDisplay.textContent = r.totalReplaced;
});

enabledToggle.addEventListener('change', () => chrome.storage.sync.set({ enabled: enabledToggle.checked }));