import { PageHeader } from "@/components/page-header";
import { AUDIT_PAGE_LIMIT, listAdmins, listAuditLog } from "@/lib/admins/data";
import { requireAdmin } from "@/lib/auth/dal";
import { listAppCreators } from "@/lib/creators/data";

import { AuditGrid } from "./audit-grid";

export default async function AuditLogPage() {
  await requireAdmin();
  const [entries, admins, creators] = await Promise.all([listAuditLog(), listAdmins(), listAppCreators()]);
  // Link only to pages that exist: a removed creator or a revoked admin has none.
  const withPage = new Set([...admins.map((a) => a.userId), ...creators.map((c) => c.id)]);

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Admins", href: "/admin/admins" }, { label: "Audit log" }]}
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
