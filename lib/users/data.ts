import "server-only";

import type { User } from "@supabase/supabase-js";

import { listAppCreators } from "@/lib/creators/data";
import { adminDb } from "@/lib/db/admin";

// Every login in the admin project, with its role. App users are in the other
// project and never appear here. Roles are derived from their own tables:
// public.admins and public.creator_logins (0006); never both.

export type Role = "admin" | "creator" | "none";

export type UserRow = {
  userId: string;
  email: string;
  role: Role;
  /** For a creator login: which creator, and its code. */
  creatorId: string | null;
  creatorCode: string | null;
  createdAt: string;
  /** When admin access was granted, and by whom (from the audit log). */
  adminSince: string | null;
  adminGrantedBy: string | null;
  lastSignInAt: string | null;
  hasAuthenticator: boolean;
};

export type AuditEntry = {
  id: number;
  occurredAt: string;
  actor: string;
  action: string;
  targetType: string;
  targetId: string;
  details: Record<string, unknown>;
};

/** Audit entries shown on the audit page; older ones stay in the database. */
export const AUDIT_PAGE_LIMIT = 1000;

/** Auth has no lookup by email; at our scale, paging through users is fine. */
export async function findUserByEmail(email: string): Promise<User | null> {
  for (const user of await allAuthUsers()) {
    if (user.email?.toLowerCase() === email) return user;
  }
  return null;
}

async function allAuthUsers(): Promise<User[]> {
  const users: User[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await adminDb().auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`auth users: ${error.message}`);
    users.push(...data.users);
    if (data.users.length < 1000) return users;
  }
}

/** user_id -> { creator id, code } for every creator login. */
async function creatorLogins(): Promise<Map<string, { creatorId: string; code: string | null }>> {
  const [{ data, error }, creators] = await Promise.all([
    adminDb().from("creator_logins").select("user_id, creator_id"),
    listAppCreators(),
  ]);
  if (error) throw new Error(`creator logins: ${error.message}`);
  const codes = new Map(creators.map((c) => [c.id, c.code]));
  return new Map(
    (data as { user_id: string; creator_id: string }[]).map((r) => [
      r.user_id,
      { creatorId: r.creator_id, code: codes.get(r.creator_id) ?? null },
    ]),
  );
}

async function adminRows(): Promise<Map<string, string>> {
  const { data, error } = await adminDb().from("admins").select("user_id, created_at");
  if (error) throw new Error(`admins: ${error.message}`);
  return new Map((data as { user_id: string; created_at: string }[]).map((r) => [r.user_id, r.created_at]));
}

/** Who granted each admin, from the newest admin.grant entry per target. */
async function grantedBy(): Promise<Map<string, string>> {
  const { data, error } = await adminDb()
    .from("audit_log")
    .select("target_id, actor_label")
    .eq("action", "admin.grant")
    .order("id", { ascending: false });
  if (error) throw new Error(`audit log: ${error.message}`);
  const by = new Map<string, string>();
  for (const row of data as { target_id: string; actor_label: string }[]) {
    if (!by.has(row.target_id)) by.set(row.target_id, row.actor_label);
  }
  return by;
}

/**
 * Whether the user has a verified TOTP factor. Asked of Auth per user: the
 * user objects from listUsers carry NO `factors` field at all (getUserById's
 * do), so reading it there showed every account as "Not yet" -- found
 * 2026-10-01 when the panel said so of an admin who had just passed step-up.
 */
async function hasVerifiedTotp(userId: string): Promise<boolean> {
  const { data, error } = await adminDb().auth.admin.mfa.listFactors({ userId });
  if (error) throw new Error(`factors for ${userId}: ${error.message}`);
  return data.factors.some((f) => f.factor_type === "totp" && f.status === "verified");
}

type Roles = {
  admins: Map<string, string>;
  by: Map<string, string>;
  creators: Map<string, { creatorId: string; code: string | null }>;
};

function toRow(user: User, hasAuthenticator: boolean, { admins, by, creators }: Roles): UserRow {
  const adminSince = admins.get(user.id) ?? null;
  const creator = creators.get(user.id) ?? null;
  return {
    userId: user.id,
    email: user.email ?? "(no email)",
    role: adminSince ? "admin" : creator ? "creator" : "none",
    creatorId: creator?.creatorId ?? null,
    creatorCode: creator?.code ?? null,
    createdAt: user.created_at,
    adminSince,
    adminGrantedBy: adminSince ? (by.get(user.id) ?? null) : null,
    lastSignInAt: user.last_sign_in_at ?? null,
    hasAuthenticator,
  };
}

export async function listUsers(): Promise<UserRow[]> {
  const [users, admins, by, creators] = await Promise.all([allAuthUsers(), adminRows(), grantedBy(), creatorLogins()]);
  // A handful of accounts: one factor lookup each is fine.
  const factors = await Promise.all(users.map((user) => hasVerifiedTotp(user.id)));
  return users.map((user, i) => toRow(user, factors[i], { admins, by, creators }));
}

export async function getUser(userId: string): Promise<UserRow | null> {
  const { data, error } = await adminDb().auth.admin.getUserById(userId);
  if (error || !data.user) return null;
  const [hasAuthenticator, admins, by, creators] = await Promise.all([
    hasVerifiedTotp(userId),
    adminRows(),
    grantedBy(),
    creatorLogins(),
  ]);
  return toRow(data.user, hasAuthenticator, { admins, by, creators });
}

export async function listAuditLog(): Promise<AuditEntry[]> {
  const { data, error } = await adminDb()
    .from("audit_log")
    .select("id, occurred_at, actor_label, action, target_type, target_id, details")
    .order("id", { ascending: false })
    .limit(AUDIT_PAGE_LIMIT);
  if (error) throw new Error(`audit log: ${error.message}`);
  return (data as {
    id: number;
    occurred_at: string;
    actor_label: string;
    action: string;
    target_type: string;
    target_id: string;
    details: Record<string, unknown>;
  }[]).map((row) => ({
    id: row.id,
    occurredAt: row.occurred_at,
    actor: row.actor_label,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    details: row.details,
  }));
}
