import { createMcpHandler, withMcpAuth } from "mcp-handler";

import { verifyMcpToken } from "@/lib/mcp/auth";
import { registerTools, SERVER_INSTRUCTIONS } from "@/lib/mcp/tools";

// https://admin.cyclea.app/mcp -- the admin's MCP endpoint (Streamable HTTP).
// Every request needs a bearer token from this project's OAuth 2.1 server,
// issued to a client an admin approved within the last 30 days
// (lib/mcp/auth.ts). Without one: 401 with a challenge pointing at the
// protected resource metadata, which names Supabase Auth as the
// authorization server.

const handler = createMcpHandler(registerTools, {
  serverInfo: { name: "cyclea-admin", version: "1.0.0" },
  instructions: SERVER_INSTRUCTIONS,
});

const authed = withMcpAuth(handler, verifyMcpToken, {
  required: true,
  resourceMetadataPath: "/.well-known/oauth-protected-resource/mcp",
  resourceUrl: "https://admin.cyclea.app",
});

export { authed as GET, authed as POST, authed as DELETE };
