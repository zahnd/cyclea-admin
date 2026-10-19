// What one sweep sends one admin, decided without I/O so it can be tested
// (`node --test`, hence no runtime imports). sweep.ts reads the items, the
// settings and what was sent before; this picks; sweep.ts sends and records.

import type { NotificationKind, NotificationSettings } from "./validation";

export type SweepItem = {
  kind: NotificationKind;
  id: string;
  /**
   * What makes the item news: created_at; for a content note the time it
   * last changed; for a support thread the user's last message -- so an
   * edited note or a user's follow-up is news once more.
   */
  version: string;
};

/** A reminder goes out this long after the item's version, once. */
export const REMINDER_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * Kinds that get one reminder when nobody acted: a report still new, a
 * support thread still waiting for us. Only to admins who get the kind
 * immediately; daily and off mean "I'll look when I look".
 */
export const REMINDER_KINDS: readonly NotificationKind[] = ["user_report", "support"];

/** One delivery's identity: the same item at a new version is a new delivery. */
export function deliveryKey(kind: string, id: string, version: string): string {
  return `${kind}:${id}:${Date.parse(version)}`;
}

export type Selection<T extends SweepItem> = {
  /** Untold items of kinds set to Immediately. */
  immediate: T[];
  /** Overdue items of reminder kinds, not reminded about yet. */
  reminders: T[];
  /** Untold items of kinds set to Daily; sent only when the digest is due. */
  daily: T[];
};

export function selectForAdmin<T extends SweepItem>({
  items,
  modes,
  told,
  reminded,
  pickedUpReports,
  now,
}: {
  items: T[];
  modes: NotificationSettings;
  /** Delivery keys this admin was told about (immediately or in a digest). */
  told: Set<string>;
  /** Delivery keys this admin was reminded about. */
  reminded: Set<string>;
  /** Report ids someone triaged (any status but new): no reminder for those. */
  pickedUpReports: Set<string>;
  now: number;
}): Selection<T> {
  const untold = items.filter((item) => !told.has(deliveryKey(item.kind, item.id, item.version)));
  return {
    immediate: untold.filter((item) => modes[item.kind] === "immediate"),
    // Support items are open threads only (the sweep's query), so "still
    // waiting" needs no check of its own; reports need the triage.
    reminders: items.filter(
      (item) =>
        REMINDER_KINDS.includes(item.kind) &&
        modes[item.kind] === "immediate" &&
        now - Date.parse(item.version) >= REMINDER_AFTER_MS &&
        !(item.kind === "user_report" && pickedUpReports.has(item.id)) &&
        !reminded.has(deliveryKey(item.kind, item.id, item.version)),
    ),
    daily: untold.filter((item) => modes[item.kind] === "daily"),
  };
}
