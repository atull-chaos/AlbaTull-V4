/**
 * Photo Open Transition Hook
 *
 * Connects the GSAP-powered repeating-frame transition to the overlay router.
 * When a photo tile is clicked, waits for the overlay hero image to appear,
 * then runs the fan transition from tile position → hero position.
 *
 * Also handles:
 *   - Image preload on hover for instant transition start
 *   - Auto-detects which side of the screen the click originates
 *     and adjusts clip-path direction accordingly
 *   - Fades out the clicked tile for a clean visual
 */

import { runRepeatTransition } from "./repeat-transition.js";

function waitFor(selector, root = document, timeoutMs = 2000) {
  const start = performance.now();
  return new Promise((resolve, reject) => {
    (function check() {
      const el = root.querySelector(selector);
      if (el) return resolve(el);
      if (performance.now() - start > timeoutMs) return reject(new Error("timeout"));
      requestAnimationFrame(check);
    })();
  });
}

// Preload the still image on pointer hover so transition starts instantly
function preloadOnHover() {
  document.addEventListener("pointerenter", (e) => {
    const a = e.target.closest('a[data-overlay-link][data-kind="photo"]');
    if (!a) return;
    const imgUrl = a.dataset.still || a.querySelector("img")?.src;
    if (imgUrl) {
      const preload = new Image();
      preload.src = imgUrl;
    }
  }, true);
}

/**
 * Determine clip-path direction based on click position.
 * Click on left half → frames wipe left-to-right
 * Click on right half → frames wipe right-to-left
 * Click on top half → frames wipe top-to-bottom
 * Click on bottom half → frames wipe bottom-to-top
 *
 * For a natural "spreading" feel, use the dominant axis.
 */
function getDirectionFromClick(el) {
  const rect = el.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const isLeft = centerX < window.innerWidth / 2;
  return isLeft ? 'left-right' : 'right-left';
}

export function initPhotoOpenTransition() {
  preloadOnHover();

  document.addEventListener("click", async (e) => {
    const a = e.target.closest('a[data-overlay-link][data-kind="photo"]');
    if (!a) return;

    // The element we animate "from" — the image container or the tile itself
    const fromEl = a.querySelector(".rolo-media, .grid-media, img, video") || a;
    const imgUrl = a.dataset.still || a.querySelector("img")?.src;
    if (!imgUrl) return;

    // Determine transition direction based on click position
    const clipDirection = getDirectionFromClick(fromEl);

    try {
      // Wait for the overlay to load and the hero image to appear
      const heroImg = await waitFor("[data-hero-img]");

      // Run the fan transition with per-click config
      await runRepeatTransition({
        fromEl,
        toEl: heroImg,
        imgUrl,
        config: {
          clipPathDirection: clipDirection,
          steps: 7,
          stepDuration: 0.32,
          stepInterval: 0.04,
          moverPauseBeforeExit: 0.12,
          rotationRange: 2,
          wobbleStrength: 8,
          pathMotion: 'linear',
        }
      });
    } catch {
      // Timeout or error — overlay still opens normally, just without the transition
    }
  });
}
