import type { NextRequest } from "next/server";

import { requireAdmin } from "@/lib/auth/dal";
import { isUuid } from "@/lib/creators/validation";
import { readManualImage } from "@/lib/feedback/image";

/**
 * A manual entry's image (migration 0009), for admins only. Served from here
 * rather than by a signed Storage URL, so no link to it exists that works
 * without an admin session, and nothing keeps a copy: no cache, no sniffing.
 */
export async function GET(_request: NextRequest, ctx: RouteContext<"/admin/feedback/app/[id]/image">) {
  // A route handler is reachable without its page: it checks for itself.
  await requireAdmin();
  const { id } = await ctx.params;
  if (!isUuid(id)) return new Response(null, { status: 404 });

  const image = await readManualImage(id);
  if (!image) return new Response(null, { status: 404 });

  return new Response(image, {
    headers: {
      // The bucket only holds what sanitizeImage() produced.
      "Content-Type": "image/webp",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
    },
  });
}
