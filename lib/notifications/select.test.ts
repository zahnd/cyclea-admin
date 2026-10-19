// `npm test`: which items one sweep sends one admin (select.ts), with the
// support kind (migration 0014) beside reports.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { deliveryKey, REMINDER_AFTER_MS, selectForAdmin, type SweepItem } from "./select.ts";
import { NOTIFICATION_KINDS, type NotificationSettings } from "./validation.ts";

const NOW = Date.parse("2026-10-17T12:00:00Z");
const HOUR = 60 * 60 * 1000;
const at = (msAgo: number) => new Date(NOW - msAgo).toISOString();

const modes = (overrides: Partial<NotificationSettings> = {}): NotificationSettings => ({
  user_report: "immediate",
  support: "immediate",
  app_feedback: "immediate",
  content_feedback: "immediate",
  ...overrides,
});

const select = (
  items: SweepItem[],
  options: {
    modes?: NotificationSettings;
    told?: SweepItem[];
    reminded?: SweepItem[];
    pickedUpReports?: string[];
  } = {},
) =>
  selectForAdmin({
    items,
    modes: options.modes ?? modes(),
    told: new Set((options.told ?? []).map((i) => deliveryKey(i.kind, i.id, i.version))),
    reminded: new Set((options.reminded ?? []).map((i) => deliveryKey(i.kind, i.id, i.version))),
    pickedUpReports: new Set(options.pickedUpReports ?? []),
    now: NOW,
  });

const ids = (items: SweepItem[]) => items.map((item) => item.id);

describe("support notifications", () => {
  const thread: SweepItem = { kind: "support", id: "t1", version: at(1 * HOUR) };

  it("is a kind admins can set", () => {
    assert.ok(NOTIFICATION_KINDS.includes("support"));
  });

  it("sends a waiting thread immediately, once", () => {
    assert.deepEqual(ids(select([thread]).immediate), ["t1"]);
    assert.deepEqual(ids(select([thread], { told: [thread] }).immediate), []);
  });

  it("treats a user's follow-up as news again", () => {
    const followUp: SweepItem = { ...thread, version: at(5 * 60 * 1000) };
    assert.deepEqual(ids(select([followUp], { told: [thread] }).immediate), ["t1"]);
  });

  it("goes to the digest for daily admins and nowhere when off", () => {
    const daily = select([thread], { modes: modes({ support: "daily" }) });
    assert.deepEqual(ids(daily.immediate), []);
    assert.deepEqual(ids(daily.daily), ["t1"]);
    const off = select([thread], { modes: modes({ support: "off" }) });
    assert.deepEqual([...off.immediate, ...off.daily, ...off.reminders], []);
  });

  it("reminds once, 24 hours after the user's last message, admins on Immediately only", () => {
    const fresh = select([thread], { told: [thread] });
    assert.deepEqual(ids(fresh.reminders), []);

    const overdue: SweepItem = { ...thread, version: new Date(NOW - REMINDER_AFTER_MS).toISOString() };
    assert.deepEqual(ids(select([overdue], { told: [overdue] }).reminders), ["t1"]);
    assert.deepEqual(ids(select([overdue], { told: [overdue], reminded: [overdue] }).reminders), []);
    assert.deepEqual(ids(select([overdue], { modes: modes({ support: "daily" }) }).reminders), []);
  });

  it("is never held back by report triage, whose ids it does not share", () => {
    const overdue: SweepItem = { kind: "support", id: "t2", version: at(25 * HOUR) };
    assert.deepEqual(ids(select([overdue], { pickedUpReports: ["t2"] }).reminders), ["t2"]);
  });
});

describe("the kinds before support still behave", () => {
  it("reminds about a report still new, not one someone picked up", () => {
    const report: SweepItem = { kind: "user_report", id: "r1", version: at(25 * HOUR) };
    assert.deepEqual(ids(select([report], { told: [report] }).reminders), ["r1"]);
    assert.deepEqual(ids(select([report], { told: [report], pickedUpReports: ["r1"] }).reminders), []);
  });

  it("never reminds about feedback", () => {
    const feedback: SweepItem = { kind: "app_feedback", id: "f1", version: at(48 * HOUR) };
    const note: SweepItem = { kind: "content_feedback", id: "n1", version: at(48 * HOUR) };
    assert.deepEqual(ids(select([feedback, note]).reminders), []);
  });

  it("splits one admin's items by their mode per kind", () => {
    const items: SweepItem[] = [
      { kind: "support", id: "s", version: at(HOUR) },
      { kind: "app_feedback", id: "f", version: at(HOUR) },
      { kind: "content_feedback", id: "n", version: at(HOUR) },
    ];
    const selection = select(items, { modes: modes({ app_feedback: "daily", content_feedback: "off" }) });
    assert.deepEqual(ids(selection.immediate), ["s"]);
    assert.deepEqual(ids(selection.daily), ["f"]);
  });
});
