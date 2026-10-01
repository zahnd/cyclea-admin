import "server-only";

import type { User } from "@supabase/supabase-js";

import { adminDb } from "@/lib/db/admin";

/** Auth has no lookup by email; at our scale, paging through users is fine. */
export async function findUserByEmail(email: string): Promise<User | null> {
  for (let page = 1; ; page++) {
    const { data, error } = await adminDb().auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const user = data.users.find((u) => u.email?.toLowerCase() === email);
    if (user) return user;
    if (data.users.length < 1000) return null;
  }
}

export type AdminRow = {
  userId: string;
  email: string;
  addedAt: string;
  addedBy: string | null;
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

async function describeAdmin(userId: string, addedAt: string, addedBy: string | null): Promise<AdminRow> {
  const db = adminDb();
  const [{ data: user, error }, { data: factors }] = await Promise.all([
    db.auth.admin.getUserById(userId),
    db.auth.admin.mfa.listFactors({ userId }),
  ]);
  if (error) throw new Error(`admin ${userId}: ${error.message}`);
  return {
    userId,
    email: user.user?.email ?? "(no email)",
    addedAt,
    addedBy,
    lastSignInAt: user.user?.last_sign_in_at ?? null,
    hasAuthenticator: (factors?.factors ?? []).some((f) => f.factor_type === "totp" && f.status === "verified"),
  };
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

export async function listAdmins(): Promise<AdminRow[]> {
  const [{ data, error }, by] = await Promise.all([
    adminDb().from("admins").select("user_id, created_at").order("created_at"),
    grantedBy(),
  ]);
  if (error) throw new Error(`admins: ${error.message}`);
  // A handful of admins: one Auth lookup each is fine, and keeps the source of
  // truth for email and sign-in in Auth rather than copied here.
  return Promise.all(
    (data as { user_id: string; created_at: string }[]).map((row) =>
      describeAdmin(row.user_id, row.created_at, by.get(row.user_id) ?? null),
    ),
  );
}

export async function getAdmin(userId: string): Promise<AdminRow | null> {
  const { data, error } = await adminDb()
    .from("admins")
    .select("user_id, created_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`admin: ${error.message}`);
  if (!data) return null;
  const by = await grantedBy();
  return describeAdmin(data.user_id, data.created_at, by.get(data.user_id) ?? null);
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
