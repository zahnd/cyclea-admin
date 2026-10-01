import { PageHeader } from "@/components/page-header";
import { AUDIT_PAGE_LIMIT, listAuditLog, listUsers } from "@/lib/users/data";
import { requireAdmin } from "@/lib/auth/dal";
import { listAppCreators } from "@/lib/creators/data";

import { AuditGrid } from "./audit-grid";

export default async function AuditLogPage() {
  await requireAdmin();
  const [entries, users, creators] = await Promise.all([listAuditLog(), listUsers(), listAppCreators()]);
  // Link only to pages that exist: a deleted account or removed creator has none.
  const withPage = new Set([...users.map((u) => u.userId), ...creators.map((c) => c.id)]);

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every administrative change, newest first. Append-only: the database refuses edits and deletions, from this app and from the SQL editor alike — only a reviewed migration could change that."
      />
      <AuditGrid
        limit={AUDIT_PAGE_LIMIT}
        rows={entries.map((entry) => ({ ...entry, targetHasPage: withPage.has(entry.targetId) }))}
      />
    </>
  );
}
