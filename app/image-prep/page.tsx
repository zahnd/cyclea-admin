import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";

import { ImagePrep } from "./image-prep";

// PUBLIC BY DESIGN: no sign-in, so editors without an admin account can use
// it. That is only safe because this route has no server side at all -- the
// page is prerendered, the images never leave the browser, and the proxy does
// not run here. Never add a server action, a route handler, a database or
// Directus call, or anything read from the request to this route; if it ever
// needs one, it moves under /admin behind requireAdmin().
export const dynamic = "force-static";

export const metadata: Metadata = { title: "Prepare images for Directus" };

export default function ImagePrepPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-8 sm:py-12">
      <PageHeader
        title="Prepare images for Directus"
        description="Drop camera photos here before uploading them to Directus. Each one is resized and compressed in this browser and saved with the same name. Nothing is uploaded anywhere."
      />
      <ImagePrep />
    </main>
  );
}
