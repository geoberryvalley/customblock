// Main content script entry point
// Wires together detection, art fetching, and DOM replacement

(async function() {
  const AR = window.__artReplacer;
  if (!AR) return;

  const ALL_CATEGORIES = [];
  const CATEGORY_DEFAULTS = Object.fromEntries(ALL_CATEGORIES.map(k => [k, true]));

  const [syncSettings, localData] = await Promise.all([
    chrome.storage.sync.get({ enabled: true}),
    chrome.storage.local.get({ unblockedElements: [] }),
  ]);

  if (!syncSettings.enabled) return;

  const settings = syncSettings;
  const enabledCategories = () =>
    ALL_CATEGORIES.filter(k => settings.categories?.[k] !== false);
  const pageKey = location.hostname + location.pathname;
  const unblockedSelectors = new Set(
    localData.unblockedElements
      .filter(e => e.pageKey === pageKey)
      .map(e => e.selector)
  );

  // ── Image URL helpers ────────────────────────────────────────────────────

  // ── Selector generation for persistence ─────────────────────────────────

  function getStableSelector(el) {
    const tag = el.tagName.toLowerCase();
    if (el.id && !/^\d/.test(el.id) && !/[_-]\d{5,}/.test(el.id)) {
      return `#${CSS.escape(el.id)}`;
    }
    for (const attr of ['data-ad-slot', 'data-ez-name', 'data-ad-name', 'name']) {
      const val = el.getAttribute(attr);
      if (val) return `${tag}[${attr}="${CSS.escape(val)}"]`;
    }
    return buildPositionalPath(el);
  }

  function buildPositionalPath(el) {
    const parts = [];
    let node = el;
    while (node && node !== document.body) {
      const parent = node.parentElement;
      if (!parent) break;
      const tag = node.tagName.toLowerCase();
      if (node.id && !/^\d/.test(node.id)) {
        parts.unshift(`#${CSS.escape(node.id)}`);
        break;
      }
      const same = Array.from(parent.children).filter(c => c.tagName === node.tagName);
      const idx = same.indexOf(node) + 1;
      parts.unshift(same.length > 1 ? `${tag}:nth-of-type(${idx})` : tag);
      node = parent;
    }
    return parts.join(' > ');
  }

  async function saveUnblockedSelector(selector) {
    unblockedSelectors.add(selector);
    const { unblockedElements = [] } = await chrome.storage.local.get('unblockedElements');
    const deduped = unblockedElements.filter(
      e => !(e.pageKey === pageKey && e.selector === selector)
    );
    deduped.push({ pageKey, selector });
    await chrome.storage.local.set({ unblockedElements: deduped });
  }

  // ── Unblock ──────────────────────────────────────────────────────────────

  function unblockElement(container) {
    if (container._adSelector) {
      saveUnblockedSelector(container._adSelector);
    }
    const saved = container._artOriginal;
    if (!saved) { container.remove(); return; }

    if (saved.type === 'iframe') {
      saved.iframe.dataset.artReplacer = 'unblocked';
      container.parentElement?.insertBefore(saved.iframe, container);
      container.remove();
    } else {
      const adElement = container.parentElement;
      if (adElement) {
        adElement.dataset.artReplacer = 'unblocked';
        adElement.innerHTML = saved.innerHTML;
      }
    }
  }

  // ── Replacement ───────────────────────────────────────────────────────────

  async function replaceAdWithArt(adElement) {
    if (adElement.dataset.artReplacer === 'replaced') return;
    const w = adElement.offsetWidth;
    const h = adElement.offsetHeight;
    if (w < 50 || h < 50) return;

    const selector = getStableSelector(adElement);
    if (unblockedSelectors.has(selector)) return;

    adElement.dataset.artReplacer = 'replacing';

    try {

      const container = document.createElement('div');
      container.className = 'art-replacer-container';
      container.style.cssText = `width:${w}px;height:${h}px;position:relative;overflow:hidden;`;
      container._adSelector = selector;

      const img = document.createElement('img');
      img.src = "https://upload.wikimedia.org/wikipedia/commons/thumb/8/89/Tomato_je.jpg/1280px-Tomato_je.jpg";
      img.className = 'art-replacer-image';
      img.style.cssText = `width:100%;height:100%;object-fit:cover;`;

      container.appendChild(img);
      if (adElement.tagName === 'IFRAME') {
        const parent = adElement.parentElement;
        if (parent) {
          const iframeClone = adElement.cloneNode(true);
          iframeClone.dataset.artReplacer = '';
          container._artOriginal = { type: 'iframe', iframe: iframeClone };
          parent.insertBefore(container, adElement);
          container.dataset.artReplacer = 'replaced';
          adElement.remove();
          chrome.runtime.sendMessage({ type: 'INCREMENT_COUNT' }).catch(() => {});
          return;
        }
        adElement.dataset.artReplacer = 'failed';
        return;
      }

      container._artOriginal = { type: 'div', innerHTML: adElement.innerHTML };
      adElement.innerHTML = '';
      adElement.appendChild(container);
      adElement.dataset.artReplacer = 'replaced';
      chrome.runtime.sendMessage({ type: 'INCREMENT_COUNT' }).catch(() => {});

    } catch (e) {
      console.warn('[Art Replacer] Failed to replace ad:', e);
      adElement.dataset.artReplacer = 'failed';
    }
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  async function processAds(adElements) {
    for (const ad of adElements) {
      await replaceAdWithArt(ad);
    }
  }

  // Initial scan
  const initialAds = AR.detectAds(document);
  if (initialAds.length > 0) {
    console.log(`[Art Replacer] Found ${initialAds.length} ads, replacing with art...`);
    await processAds(initialAds);
  }

  if (AR.startObserver) {
    AR.startObserver(async (newAds) => {
      if (newAds.length > 0) {
        console.log(`[Art Replacer] Found ${newAds.length} new ads, replacing...`);
        await processAds(newAds);
      }
    });
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync') {
      if (changes.enabled?.newValue === false) location.reload();
    }
    if (area === 'local' && changes.unblockedElements) {
      unblockedSelectors.clear();
      (changes.unblockedElements.newValue || [])
        .filter(e => e.pageKey === pageKey)
        .forEach(e => unblockedSelectors.add(e.selector));
    }
  });
})();
