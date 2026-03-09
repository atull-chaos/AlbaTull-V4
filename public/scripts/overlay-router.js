/**
 * Overlay + Route Router
 * Opens photo/video detail in a lightbox overlay while updating the URL
 * via History API so links are shareable. Supports direct visits too.
 *
 * IMPORTANT: This site is built as static (output: 'static'), so the
 * ?fragment=1 approach doesn't work — query params aren't processed at
 * build time. Instead, we fetch the full page and extract just the
 * .detail-layout content using DOMParser.
 */

const OVERLAY_ID = "stage-overlay";
const $ = (sel, root = document) => root.querySelector(sel);

function saveScroll() {
  return { x: window.scrollX, y: window.scrollY };
}

function restoreScroll(pos) {
  window.scrollTo(pos.x, pos.y);
}

async function fetchFragment(url) {
  const res = await fetch(url, { headers: { "X-Overlay": "1" } });
  if (!res.ok) throw new Error(`Failed to load ${url}`);
  const html = await res.text();

  // Parse the full page and extract just the detail content
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Try to get just the detail-layout (photo hero + sidebar)
  const detailLayout = doc.querySelector('.detail-layout');
  if (detailLayout) return detailLayout.outerHTML;

  // Fallback: get the main content area
  const main = doc.querySelector('main');
  if (main) return main.innerHTML;

  // Last resort: return raw HTML (shouldn't happen)
  return html;
}

export function initOverlayRouter() {
  const overlay = document.getElementById(OVERLAY_ID);
  if (!overlay) return;

  const closeEls = overlay.querySelectorAll("[data-overlay-close]");
  const body = $("[data-overlay-body]", overlay);

  let lastScroll = null;
  let lastUrl = null;
  let isOpen = false;

  async function openOverlay(url, { push = true } = {}) {
    if (!lastScroll) lastScroll = saveScroll();
    if (!lastUrl) lastUrl = window.location.pathname + window.location.search;

    overlay.classList.add("is-open");
    overlay.setAttribute("aria-hidden", "false");
    document.documentElement.classList.add("overlay-open");
    isOpen = true;

    body.innerHTML = `<div class="overlay-loading" style="display:flex;align-items:center;justify-content:center;height:100%;color:#999;">Loading...</div>`;

    try {
      body.innerHTML = await fetchFragment(url);
    } catch (err) {
      body.innerHTML = `<div style="padding:40px;color:#999;">Failed to load content.</div>`;
      console.error(err);
    }

    if (push) {
      history.pushState({ overlay: true, url, lastUrl, lastScroll }, "", url);
    }
  }

  function closeOverlay({ pop = false } = {}) {
    overlay.classList.remove("is-open");
    overlay.setAttribute("aria-hidden", "true");
    document.documentElement.classList.remove("overlay-open");
    isOpen = false;

    const state = history.state;
    const backTo = state?.lastUrl || lastUrl;
    if (!pop && backTo) history.pushState({}, "", backTo);

    const pos = state?.lastScroll || lastScroll;
    if (pos) restoreScroll(pos);

    lastScroll = null;
    lastUrl = null;
  }

  // Intercept clicks on overlay links
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[data-overlay-link]");
    if (!a) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    openOverlay(a.getAttribute("href"), { push: true }).catch(console.error);
  });

  // Close handlers
  closeEls.forEach((el) => el.addEventListener("click", () => closeOverlay()));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isOpen) closeOverlay();
  });

  // Back/forward browser navigation
  window.addEventListener("popstate", () => {
    const path = window.location.pathname;
    const isDetail = path.startsWith("/photo/") || path.startsWith("/video/");
    if (isDetail && !isOpen) {
      openOverlay(path + window.location.search, { push: false }).catch(console.error);
    }
    if (!isDetail && isOpen) {
      closeOverlay({ pop: true });
    }
  });

  // Handle direct visits to /photo/slug or /video/slug
  // For direct visits, DON'T use overlay — let the page render normally
  // The overlay is only for SPA-style navigation from galleries/mosaic

  // Expose for programmatic use
  window.__overlay = { open: openOverlay, close: closeOverlay };
}
