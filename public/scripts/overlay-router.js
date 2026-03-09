/**
 * Overlay Router — DISABLED
 *
 * The overlay system was designed for SSR (server-side rendering) where
 * ?fragment=1 returns just the detail content. Since this site is built
 * as static (output: 'static'), query params aren't processed at build
 * time, so the overlay always received the full HTML page. This caused:
 * - Frozen/broken links
 * - Wrong photos appearing
 * - Garbled content with duplicate navs and scripts
 *
 * All navigation now uses standard full-page links, which work reliably.
 */

export function initOverlayRouter() {
  // Overlay disabled — all links use standard navigation
}
