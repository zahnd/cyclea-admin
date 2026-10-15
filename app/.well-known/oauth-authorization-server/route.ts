import { metadataCorsOptionsRequestHandler } from "mcp-handler";

// For older MCP clients that look for authorization server metadata on the
// resource's own origin instead of following RFC 9728: Supabase Auth's
// document, passed through unchanged. The current spec does not need this.

const UPSTREAM = "https://mtcnwjpjbupsbkbhqbph.supabase.co/.well-known/oauth-authorization-server/auth/v1";

export async function GET() {
  const res = await fetch(UPSTREAM, { next: { revalidate: 3600 } });
  if (!res.ok) return Response.json({ error: "upstream_unavailable" }, { status: 502 });
  return new Response(await res.text(), {
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

export const OPTIONS = metadataCorsOptionsRequestHandler();
