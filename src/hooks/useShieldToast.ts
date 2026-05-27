/**
 * Purpose:
 *   Watches the appliedProtections array for changes and emits a transient
 *   "what just happened" toast each time a shield is toggled on or off.
 *   The toast carries the rule-defined message from shieldRules.ts so the
 *   user gets named cause-and-effect in plain language alongside the
 *   visual change in the tile.
 *
 * Dependencies:
 *   - React (useEffect, useState, useRef)
 *   - @/config/shieldRules (rule lookup, toast text)
 *
 * Used by:
 *   - src/components/sections/UnderTheHoodSection.tsx (mounts the toast
 *     UI and feeds it the live protections array)
 *
 * Changes:
 *   2026-05-18: Initial.
 */

import { useEffect, useRef, useState } from 'react';
import { ruleFor } from '@/config/shieldRules';

export type ToastVariant = 'enable' | 'disable';

export interface ShieldToast {
  /** Unique id so the component can key animations. */
  id: number;
  protectionId: string;
  shortLabel: string;
  message: string;
  variant: ToastVariant;
  /** Wall-clock timestamp when the toast was created. */
  createdAt: number;
}

const TOAST_LIFETIME_MS = 4500;

/**
 * Diff successive appliedProtections arrays, emit toasts for changes,
 * auto-expire after ~4.5 seconds. Returns the list of active toasts.
 */
export function useShieldToast(appliedProtections: string[]): ShieldToast[] {
  const [toasts, setToasts] = useState<ShieldToast[]>([]);
  // Previous applied-protections snapshot — we diff against this to figure
  // out which shields changed since last render.
  const previousRef = useRef<string[] | null>(null);
  const nextIdRef = useRef(0);

  useEffect(() => {
    const previous = previousRef.current;
    previousRef.current = [...appliedProtections];
    if (previous === null) return; // first render — nothing to diff against

    const prevSet = new Set(previous);
    const curSet = new Set(appliedProtections);
    const justDisabled = previous.filter((id) => !curSet.has(id));
    const justEnabled = appliedProtections.filter((id) => !prevSet.has(id));

    const newToasts: ShieldToast[] = [];
    const now = Date.now();
    for (const id of justDisabled) {
      const rule = ruleFor(id);
      if (!rule) continue;
      newToasts.push({
        id: ++nextIdRef.current,
        protectionId: id,
        shortLabel: rule.shortLabel,
        message: rule.toastOnDisable,
        variant: 'disable',
        createdAt: now,
      });
    }
    for (const id of justEnabled) {
      const rule = ruleFor(id);
      if (!rule) continue;
      newToasts.push({
        id: ++nextIdRef.current,
        protectionId: id,
        shortLabel: rule.shortLabel,
        message: rule.toastOnEnable,
        variant: 'enable',
        createdAt: now,
      });
    }

    if (newToasts.length === 0) return;
    setToasts((current) => [...current, ...newToasts]);
  }, [appliedProtections]);

  // Single timer that prunes expired toasts. Cheaper than per-toast timers
  // when several shields are toggled in quick succession.
  useEffect(() => {
    if (toasts.length === 0) return;
    const interval = setInterval(() => {
      const cutoff = Date.now() - TOAST_LIFETIME_MS;
      setToasts((current) => current.filter((t) => t.createdAt > cutoff));
    }, 500);
    return () => clearInterval(interval);
  }, [toasts.length]);

  return toasts;
}
