import "server-only";

import { adminDb } from "@/lib/db/admin";

// Which AI clients an admin approved for the MCP endpoint (migration 0013).
// Supabase's own OAuth consent lives until revoked; ours lasts 30 days, and
// the endpoint accepts a token only while its (user, client) row here is
// neither expired nor revoked.

export const MCP_GRANT_DAYS = 30;

export type McpGrant = {
  clientId: string;
  clientName: string;
  redirectHost: string;
  approvedAt: string;
  expiresAt: string;
  revokedAt: string | null;
};

export type McpGrantState = "active" | "expired" | "revoked";

type GrantRow = {
  client_id: string;
  client_name: string;
  redirect_host: string;
  approved_at: string;
  expires_at: string;
  revoked_at: string | null;
};

const COLUMNS = "client_id, client_name, redirect_host, approved_at, expires_at, revoked_at";

function fromRow(row: GrantRow): McpGrant {
  return {
    clientId: row.client_id,
    clientName: row.client_name,
    redirectHost: row.redirect_host,
    approvedAt: row.approved_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
  };
}

export function grantState(grant: McpGrant, now = Date.now()): McpGrantState {
  if (grant.revokedAt) return "revoked";
  return Date.parse(grant.expiresAt) > now ? "active" : "expired";
}

export async function listGrants(adminId: string): Promise<McpGrant[]> {
  const { data, error } = await adminDb()
    .from("mcp_grants")
    .select(COLUMNS)
    .eq("admin_id", adminId)
    .order("approved_at", { ascending: false });
  if (error) throw new Error(`mcp grants: ${error.message}`);
  return (data as GrantRow[]).map(fromRow);
}

/** The approval for this admin and client while it is active, else null. */
export async function activeGrant(adminId: string, clientId: string): Promise<McpGrant | null> {
  const { data, error } = await adminDb()
    .from("mcp_grants")
    .select(COLUMNS)
    .eq("admin_id", adminId)
    .eq("client_id", clientId)
    .maybeSingle();
  if (error) throw new Error(`mcp grants: ${error.message}`);
  if (!data) return null;
  const grant = fromRow(data as GrantRow);
  return grantState(grant) === "active" ? grant : null;
}

/** Records an approval for 30 days, with the audit entry (approve_mcp_client). */
export async function approveClient(input: {
  adminId: string;
  clientId: string;
  clientName: string;
  redirectHost: string;
  actorLabel: string;
}): Promise<void> {
  const { error } = await adminDb().rpc("approve_mcp_client", {
    p_admin_id: input.adminId,
    p_client_id: input.clientId,
    p_client_name: input.clientName,
    p_redirect_host: input.redirectHost,
    p_actor_label: input.actorLabel,
  });
  if (error) throw new Error(`approve_mcp_client: ${error.message}`);
}

/** Revokes an active approval, with the audit entry (revoke_mcp_client). Returns whether one was active. */
export async function revokeClient(adminId: string, clientId: string, actorLabel: string): Promise<boolean> {
  const { data, error } = await adminDb().rpc("revoke_mcp_client", {
    p_admin_id: adminId,
    p_client_id: clientId,
    p_actor_label: actorLabel,
  });
  if (error) throw new Error(`revoke_mcp_client: ${error.message}`);
  return data === true;
}
