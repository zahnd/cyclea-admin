// `npm test` -- Node's own runner, types stripped by Node itself. Only the
// pure halves of lib/support are loaded: no database, no server-only.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { splitConversation, toMessage, toThread, type MessageRow, type ThreadRow } from "./rows.ts";
import {
  compareInbox,
  lastActivity,
  replyError,
  signatureLabel,
  supportNameError,
  supportRaised,
  SUPPORT_RAISED_MESSAGES,
  threadUserLabel,
} from "./validation.ts";

const threadRow = (overrides: Partial<ThreadRow> = {}): ThreadRow => ({
  id: "00000000-0000-4000-8000-000000000001",
  status: "open",
  created_at: new Date("2026-10-17T08:00:00Z"),
  updated_at: new Date("2026-10-17T09:00:00Z"),
  closed_at: null,
  last_user_message_at: new Date("2026-10-17T09:00:00Z"),
  last_team_message_at: null,
  user_read_at: null,
  platform: "ios",
  app_version: "1.2.0+14",
  locale: "de",
  username: "lena",
  display_name: "Lena",
  entitled: true,
  message_count: "3",
  user_message_count: "1",
  ...overrides,
});

describe("toThread", () => {
  it("maps the view's row, bigint counts arriving as strings", () => {
    const thread = toThread(threadRow());
    assert.deepEqual(thread, {
      id: "00000000-0000-4000-8000-000000000001",
      status: "open",
      createdAt: "2026-10-17T08:00:00.000Z",
      updatedAt: "2026-10-17T09:00:00.000Z",
      closedAt: null,
      lastUserMessageAt: "2026-10-17T09:00:00.000Z",
      lastTeamMessageAt: null,
      userReadAt: null,
      platform: "ios",
      appVersion: "1.2.0+14",
      locale: "de",
      username: "lena",
      displayName: "Lena",
      entitled: true,
      messageCount: 3,
      userMessageCount: 1,
    });
  });

  it("reads a missing entitlement or count as none", () => {
    const thread = toThread(threadRow({ entitled: null, message_count: null, user_message_count: 2 }));
    assert.equal(thread.entitled, false);
    assert.equal(thread.messageCount, 0);
    assert.equal(thread.userMessageCount, 2);
  });

  it("carries no user id or email: the view has none to give", () => {
    const keys = Object.keys(toThread(threadRow()));
    assert.ok(!keys.some((key) => /user_?id|email/i.test(key)), keys.join(", "));
  });
});

const messageRow = (overrides: Partial<MessageRow>): MessageRow => ({
  id: "m",
  thread_id: "t",
  author: "user",
  body: "text",
  team_name: null,
  from_transcript: false,
  created_at: new Date("2026-10-17T09:00:00Z"),
  ...overrides,
});

describe("toMessage and splitConversation", () => {
  it("maps team messages with their signature", () => {
    const message = toMessage(messageRow({ author: "team", team_name: "Stefan", from_transcript: null }));
    assert.equal(message.teamName, "Stefan");
    assert.equal(message.fromTranscript, false);
    assert.equal(message.createdAt, "2026-10-17T09:00:00.000Z");
  });

  it("puts the AI transcript before the handoff, even on a tied timestamp", () => {
    const at = new Date("2026-10-17T09:00:00Z");
    const later = new Date("2026-10-17T10:00:00Z");
    const messages = [
      messageRow({ id: "u1", author: "user", created_at: at }),
      messageRow({ id: "t1", author: "user", from_transcript: true, created_at: at }),
      messageRow({ id: "t2", author: "assistant", from_transcript: true, created_at: at }),
      messageRow({ id: "r1", author: "team", team_name: "Stefan", created_at: later }),
    ].map(toMessage);
    const { transcript, conversation } = splitConversation(messages);
    assert.deepEqual(
      transcript.map((m) => m.id),
      ["t1", "t2"],
    );
    assert.deepEqual(
      conversation.map((m) => m.id),
      ["u1", "r1"],
    );
  });
});

describe("labels", () => {
  it("names the user by username and display name, whichever exist", () => {
    assert.equal(threadUserLabel({ username: "lena", displayName: "Lena" }), "@lena · Lena");
    assert.equal(threadUserLabel({ username: null, displayName: "Lena" }), "Lena");
    assert.equal(threadUserLabel({ username: null, displayName: null }), "(no name)");
  });

  it("signs a reply the way the app shows it", () => {
    assert.equal(signatureLabel("Stefan"), "Stefan · Cyclea team");
  });
});

describe("inbox order", () => {
  const base = { createdAt: "2026-10-01T00:00:00Z", lastTeamMessageAt: null as string | null };
  const waitingLong = { ...base, id: "a", status: "open" as const, lastUserMessageAt: "2026-10-10T00:00:00Z" };
  const waitingShort = { ...base, id: "b", status: "open" as const, lastUserMessageAt: "2026-10-16T00:00:00Z" };
  const answeredRecent = {
    ...base,
    id: "c",
    status: "answered" as const,
    lastUserMessageAt: "2026-10-09T00:00:00Z",
    lastTeamMessageAt: "2026-10-17T00:00:00Z",
  };
  const answeredOld = {
    ...base,
    id: "d",
    status: "answered" as const,
    lastUserMessageAt: "2026-10-02T00:00:00Z",
    lastTeamMessageAt: "2026-10-03T00:00:00Z",
  };
  const closed = { ...base, id: "e", status: "closed" as const, lastUserMessageAt: "2026-10-17T12:00:00Z" };

  it("puts waiting first, the longest waiting at the top, then the rest by activity", () => {
    const sorted = [closed, answeredOld, waitingShort, answeredRecent, waitingLong].sort(compareInbox);
    assert.deepEqual(
      sorted.map((t) => t.id),
      ["a", "b", "c", "d", "e"],
    );
  });

  it("takes the newest message in either direction as the last activity", () => {
    assert.equal(lastActivity(answeredRecent), "2026-10-17T00:00:00Z");
    assert.equal(lastActivity({ ...base, lastUserMessageAt: null }), base.createdAt);
  });
});

describe("reply and signature rules", () => {
  it("refuses an empty or over-long reply, counting characters as Postgres does", () => {
    assert.ok(replyError("   "));
    assert.equal(replyError("Thanks, fixed in 1.2.1."), null);
    assert.equal(replyError("é".repeat(4000)), null);
    assert.ok(replyError("x".repeat(4001)));
    // 4000 emoji are 8000 UTF-16 units but 4000 characters.
    assert.equal(replyError("🙂".repeat(4000)), null);
  });

  it("allows a one-line name of up to 40 characters", () => {
    assert.equal(supportNameError("Stefan"), null);
    assert.equal(supportNameError("x".repeat(40)), null);
    assert.ok(supportNameError("x".repeat(41)));
    assert.ok(supportNameError("Ste\nfan"));
  });
});

describe("supportRaised", () => {
  it("names what the app's support functions raise, wherever the name is", () => {
    assert.equal(supportRaised({ message: "thread_closed" }), "thread_closed");
    assert.equal(supportRaised({ message: "support_team_reply: thread_closed", code: "P0001" }), "thread_closed");
    assert.equal(supportRaised({ message: "invalid" }), "invalid");
    assert.equal(supportRaised({ message: "support_team_reply: invalid" }), "invalid");
    assert.equal(supportRaised({ message: "check failed", hint: "open_thread_exists" }), "open_thread_exists");
    assert.equal(supportRaised(Object.assign(new Error("open_thread_exists"), { code: "23505" })), "open_thread_exists");
  });

  it("leaves everything else to the generic message", () => {
    assert.equal(supportRaised({ message: 'invalid input syntax for type uuid: "x"' }), null);
    assert.equal(supportRaised({ message: "permission denied for function support_team_reply" }), null);
    assert.equal(supportRaised(new Error("Connection terminated unexpectedly")), null);
    assert.equal(supportRaised("thread_closed"), null);
    assert.equal(supportRaised(null), null);
  });

  it("has a friendly message for each, without user text", () => {
    for (const message of Object.values(SUPPORT_RAISED_MESSAGES)) assert.ok(message.length > 0);
  });
});
