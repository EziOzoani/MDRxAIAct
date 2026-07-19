/**
 * Purpose:
 *   Single source of truth for what each of the 10 shield/protection
 *   toggles does when removed. The rule table maps every protection ID to
 *   one or more visual consequences — banner across the tile, redaction
 *   strip over a specific region, hidden affordance, or callout block.
 *
 *   This is the heart of the shield-reactive system: the tile and toast
 *   components read this table and render the consequences. Adding a new
 *   shield = adding one row here, no other code changes.
 *
 * Dependencies:
 *   None — pure configuration.
 *
 * Used by:
 *   - src/components/tiles/Tile1Data.tsx (renders rules into the data tile)
 *   - src/hooks/useShieldToast.ts (emits toasts when rules activate)
 *
 * Changes:
 *   2026-05-18: Initial. All 10 shields mapped to one or more visual
 *               effects. Tier-shift effects (bias-testing, transparency)
 *               are flagged but their primary visual effect — different
 *               KNN images + bars — is handled by the tier-driven render
 *               path in Tile1Data, not by this table.
 */

export type ShieldEffectTarget =
  /** Big banner across the very top of the tile. */
  | 'tile-top-banner'
  /** Redact the per-class distribution bars in the expanded view. */
  | 'redact-per-class-bars'
  /** Redact the "Source: ..." line under the bars. */
  | 'redact-source-line'
  /** Redact the body text of the MDR box on the flip-back. */
  | 'redact-flip-mdr'
  /** Redact the body text of the AI Act box on the flip-back. */
  | 'redact-flip-aiact'
  /** Hide the "Not a diagnosis" disclaimer under the user's photo. */
  | 'hide-ifu-disclaimer'
  /** Inline callout block underneath the bars. */
  | 'bottom-callout';

export type ShieldSeverity = 'critical' | 'warning' | 'info';

export interface ShieldEffect {
  /** Visual element this effect targets in Tile 1. */
  target: ShieldEffectTarget;
  /** Severity drives colour: critical = red, warning = amber, info = slate. */
  severity: ShieldSeverity;
  /** Short label shown on the banner / redaction strip. */
  label: string;
  /** Optional one-line explanation rendered below the label. */
  detail?: string;
}

export interface ShieldRule {
  /** Protection ID from RegulationMenu allProtections. */
  protectionId: string;
  /** Short tag shown in toast (e.g. "BIAS"). */
  shortLabel: string;
  /** Human-readable name for toasts. */
  name: string;
  /** Whether this shield also flips the model tier. Tier-shift visuals are
   *  handled separately (bars + KNN images), this flag is just for clarity
   *  when reading the rules. */
  alsoShiftsTier: boolean;
  /** Visual effects to apply when this shield is OFF. May be empty for
   *  shields whose only effect is a tier shift. */
  effects: ShieldEffect[];
  /** Toast message when the shield is toggled OFF. */
  toastOnDisable: string;
  /** Toast message when the shield is toggled back ON. */
  toastOnEnable: string;
}

export const SHIELD_RULES: ShieldRule[] = [
  // ─── MDR shields ──────────────────────────────────────────────────────
  {
    protectionId: 'ce-marking',
    shortLabel: 'CE',
    name: 'CE Marking',
    alsoShiftsTier: false,
    effects: [
      {
        target: 'tile-top-banner',
        severity: 'critical',
        label: 'NOT CERTIFIED',
        detail: 'Without CE marking, this would not be deployable as a Class IIa medical device.',
      },
    ],
    toastOnDisable: 'CE Marking removed — device not certified for clinical use.',
    toastOnEnable: 'CE Marking restored.',
  },
  {
    // ID matches RegulationMenu.tsx's allProtections list — keep them in sync.
    protectionId: 'clinical-eval',
    shortLabel: 'CLIN',
    name: 'Clinical Evaluation',
    alsoShiftsTier: false,
    effects: [
      {
        // Clinical Evaluation is about clinical performance evidence, not
        // training-data composition. Target the bottom callout area until
        // a proper per-skin-tone performance panel lands in Tile 1.
        target: 'bottom-callout',
        severity: 'critical',
        label: 'No clinical evaluation evidence',
        detail: 'Without Clinical Evaluation, per-skin-tone accuracy cannot be reported. Required for MDR Class IIa.',
      },
    ],
    toastOnDisable: 'Clinical Evaluation removed — no clinical performance evidence.',
    toastOnEnable: 'Clinical Evaluation restored.',
  },
  {
    protectionId: 'pms',
    shortLabel: 'PMS',
    name: 'Post-Market Surveillance',
    alsoShiftsTier: false,
    // Banner removed: it described a hypothetical future state rather than
    // anything observable in the tile, and stacked with the drift banner to
    // push the actual data off screen. The toast below still fires on toggle.
    effects: [],
    toastOnDisable: 'Post-Market Surveillance removed — silent degradation possible.',
    toastOnEnable: 'Post-Market Surveillance restored.',
  },
  {
    protectionId: 'incident',
    shortLabel: 'INC',
    name: 'Incident Reporting',
    alsoShiftsTier: false,
    effects: [
      {
        target: 'bottom-callout',
        severity: 'warning',
        label: 'No incident reporting path',
        detail: 'Errors will not be recorded or escalated to a competent authority.',
      },
    ],
    toastOnDisable: 'Incident Reporting removed — errors will go unrecorded.',
    toastOnEnable: 'Incident Reporting restored.',
  },
  {
    protectionId: 'ifu',
    shortLabel: 'IFU',
    name: 'Instructions for Use',
    alsoShiftsTier: false,
    effects: [
      {
        target: 'hide-ifu-disclaimer',
        severity: 'warning',
        label: 'No "not a diagnosis" disclaimer',
      },
    ],
    toastOnDisable: 'IFU removed — users may interpret this as a diagnosis.',
    toastOnEnable: 'IFU restored — disclaimer visible.',
  },

  // ─── AI Act shields ──────────────────────────────────────────────────
  {
    protectionId: 'bias-testing',
    shortLabel: 'BIAS',
    name: 'Bias Testing',
    alsoShiftsTier: true,
    effects: [
      // Tier-shift handles the bars + KNN images. Add a callout so the
      // shield's removal also leaves a visible written trace.
      {
        target: 'bottom-callout',
        severity: 'critical',
        label: 'Not validated across skin tones',
        detail: 'Model has not been audited for demographic fairness in this tier.',
      },
    ],
    toastOnDisable: 'Bias Testing removed — model switched to the unbalanced tier. Watch the neighbours change.',
    toastOnEnable: 'Bias Testing restored — back to the balanced tier.',
  },
  {
    protectionId: 'explainability',
    shortLabel: 'XAI',
    name: 'Explainability',
    alsoShiftsTier: false,
    effects: [
      {
        target: 'redact-flip-mdr',
        severity: 'critical',
        label: 'Explainability required — text redacted',
      },
      {
        target: 'redact-flip-aiact',
        severity: 'critical',
        label: 'Explainability required — text redacted',
      },
    ],
    toastOnDisable: 'Explainability removed — flip the tile to see what is now redacted.',
    toastOnEnable: 'Explainability restored — regulatory rationale visible again.',
  },
  {
    protectionId: 'drift-monitor',
    shortLabel: 'DRFT',
    name: 'Drift Monitoring',
    alsoShiftsTier: false,
    // Banner removed — see the post-market rule above for the reasoning.
    effects: [],
    toastOnDisable: 'Drift Monitoring removed — silent performance degradation possible.',
    toastOnEnable: 'Drift Monitoring restored.',
  },
  {
    protectionId: 'transparency',
    shortLabel: 'TRNS',
    name: 'Transparency',
    alsoShiftsTier: true,
    effects: [
      // Tier-shift handles the bars + KNN images. Add a redaction on the
      // source-of-data line because that's the most concrete "transparency
      // is gone" cue.
      {
        target: 'redact-source-line',
        severity: 'critical',
        label: 'Source data redacted — Transparency required',
      },
    ],
    toastOnDisable: 'Transparency removed — model switched to uncleaned tier; data source hidden.',
    toastOnEnable: 'Transparency restored — full data provenance visible.',
  },
  {
    protectionId: 'human-oversight',
    shortLabel: 'HUM',
    name: 'Human Oversight',
    alsoShiftsTier: false,
    effects: [
      {
        target: 'bottom-callout',
        severity: 'critical',
        label: 'AI decisions fully automated',
        detail: 'No clinician review of model output. Step 3 confirmation is informational only.',
      },
    ],
    toastOnDisable: 'Human Oversight removed — no clinician will review these results.',
    toastOnEnable: 'Human Oversight restored.',
  },
];

/**
 * Convenience lookup: for a given list of disabled protection IDs, return
 * all the visual effects that should be active right now. Components can
 * then filter by `target` to find what applies to them.
 */
export function activeShieldEffects(disabled: string[]): ShieldEffect[] {
  const disabledSet = new Set(disabled);
  return SHIELD_RULES.filter((r) => disabledSet.has(r.protectionId)).flatMap((r) => r.effects);
}

/**
 * Find the rule for a single protection ID (used by toast emission).
 */
export function ruleFor(protectionId: string): ShieldRule | undefined {
  return SHIELD_RULES.find((r) => r.protectionId === protectionId);
}
