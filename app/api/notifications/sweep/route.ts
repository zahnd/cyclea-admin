import { createHash, timingSafeEqual } from "node:crypto";

import { runSweep } from "@/lib/notifications/sweep";

// Called every 5 minutes by pg_cron in the admin project (migration 0011),
// with the bearer secret it keeps in Vault. Machine to machine: no session,
// and outside the proxy's matcher. It answers with counts only.

function authorized(request: Request): boolean {
  const secret = process.env.NOTIFY_SWEEP_SECRET;
  if (!secret) return false;
  const given = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1] ?? "";
  // Hashed first, so the comparison takes the same time whatever the length.
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!process.env.NOTIFY_SWEEP_SECRET) {
    console.error("[notifications] NOTIFY_SWEEP_SECRET is not set; sweep refused");
    return Response.json({ error: "not_configured" }, { status: 503 });
  }
  if (!authorized(request)) {
    // Never log what was sent.
    console.warn("[notifications] sweep called without the right secret");
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    return Response.json(await runSweep());
  } catch (error) {
    console.error(`[notifications] sweep failed: ${error instanceof Error ? error.message : String(error)}`);
    return Response.json({ error: "sweep_failed" }, { status: 500 });
  }
}
