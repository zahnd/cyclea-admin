import "server-only";

import type { AuthInfo } from "@modelcontextprotocol/server";

import { getRole } from "@/lib/auth/dal";
import { adminDb } from "@/lib/db/admin";

import { activeGrant } from "./grants";

// Bearer tokens for /mcp are this project's Supabase JWTs, issued by its OAuth
// 2.1 server to a client an admin approved. A token is accepted only when
//   1. Supabase Auth itself confirms it (getUser: signature, expiry, session
//      not revoked),
//   2. it was issued to an OAuth client (a client_id claim -- a browser
//      session is not an MCP client),
//   3. its user is an admin, and
//   4. that admin's approval of that client (mcp_grants, 0013) is active.
// The token's own `aal` is not relied on: the approval that created the
// mcp_grants row required a fresh authenticator code.
// Anything else: undefined, which withMcpAuth answers with a 401 challenge.

export type McpPrincipal = { adminId: string; email: string; clientId: string; clientName: string };

/** The payload of a JWT that Supabase has already verified -- never used to decide on its own. */
function payload(token: string): Record<string, unknown> | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function verifyMcpToken(_request: Request, token?: string): Promise<AuthInfo | undefined> {
  if (!token) return undefined;
  try {
    const { data, error } = await adminDb().auth.getUser(token);
    if (error || !data.user) return undefined;

    const claims = payload(token);
    const clientId = typeof claims?.client_id === "string" ? claims.client_id : null;
    if (!clientId || claims?.sub !== data.user.id) return undefined;

    if ((await getRole(data.user.id)).kind !== "admin") return undefined;
    const grant = await activeGrant(data.user.id, clientId);
    if (!grant) return undefined;

    const principal: McpPrincipal = {
      adminId: data.user.id,
      email: data.user.email ?? "",
      clientId,
      clientName: grant.clientName,
    };
    return {
      token,
      clientId,
      scopes: [],
      expiresAt: typeof claims?.exp === "number" ? claims.exp : undefined,
      extra: principal,
    };
  } catch (error) {
    // Fail closed, and never log the token.
    console.error(`[mcp] token check failed: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

/** The verified principal behind a tool call. */
export function principalOf(authInfo: AuthInfo | undefined): McpPrincipal {
  const extra = authInfo?.extra as McpPrincipal | undefined;
  if (!extra?.adminId) throw new Error("Not authenticated.");
  return extra;
}
