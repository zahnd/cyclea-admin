import { metadataCorsOptionsRequestHandler, protectedResourceHandler } from "mcp-handler";

// RFC 9728 metadata for https://admin.cyclea.app/mcp: the authorization server
// is this project's Supabase Auth (OAuth 2.1 server, config.toml).

const handler = protectedResourceHandler({
  authServerUrls: ["https://mtcnwjpjbupsbkbhqbph.supabase.co/auth/v1"],
  resourceUrl: "https://admin.cyclea.app/mcp",
});

export { handler as GET };
export const OPTIONS = metadataCorsOptionsRequestHandler();
