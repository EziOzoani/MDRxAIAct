/**
 * Purpose:
 *   Centralised feature flags for the demo. Toggle these to enable or
 *   disable cross-cutting UI features without ripping them out of multiple
 *   files. When a flag flips off, the underlying implementation stays in
 *   place — only the entry points and UI surfaces disappear. Flip the flag
 *   back to true and the feature returns with no other code changes needed.
 *
 * Dependencies:
 *   None — pure constants.
 *
 * Used by:
 *   - src/pages/Index.tsx (perspective toggle button + PiP overlay gates)
 *
 * Changes:
 *   2026-05-18: Initial. Added PERSPECTIVE_TOGGLE so the Medical / Engineer
 *               view machinery can stay in the codebase while the tile-based
 *               Under-the-Hood redesign settles. Engineer content will
 *               return through a tile flip-back rather than a global toggle.
 */

export const FEATURE_FLAGS = {
  /**
   * Medical / Engineer perspective TOGGLE (the user-facing switch).
   *
   * When false:
   *   - Top-right toggle button does not render
   *   - User cannot flip between Medical and Engineer views
   *   - The {perspective === 'engineer'} content blocks in PhotoCaptureSection
   *     and ResultsSection therefore never appear during a normal walkthrough
   *
   * Set to true to give the user a global view switch again.
   */
  PERSPECTIVE_TOGGLE: false,

  /**
   * Engineering view inside Under-the-Hood only.
   *
   * Separate from the global toggle above. When true:
   *   - PiP "Engineer View" overlay appears in the Under-the-Hood step
   *   - UnderTheHoodSection receives perspective='engineer' as a hardcoded
   *     prop, so any future engineer-only content inside the workshop step
   *     renders automatically
   *
   * Note: this only affects the UTH step. Other sections still receive the
   * default 'doctor' perspective, so the upper steps stay clean of
   * engineer-mode chrome.
   */
  ENGINEER_VIEW_IN_UTH: true,
} as const;
