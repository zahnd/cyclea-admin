import { requireAdmin } from "@/lib/auth/dal";
import { listAppCreators, listCreatorRecords } from "@/lib/creators/data";

import { CreatorsGrid, type CreatorRow } from "./creators-grid";

export default async function CreatorsPage() {
  await requireAdmin();

  // Each side read separately and joined here: Postgres cannot join across
  // the two projects.
  const [creators, records] = await Promise.all([listAppCreators(), listCreatorRecords()]);
  const recorded = new Set(records.map((record) => record.id));

  const rows: CreatorRow[] = creators.map((creator) => ({
    id: creator.id,
    code: creator.code,
    name: creator.name,
    active: creator.active,
    createdAt: creator.createdAt,
    hasRecord: recorded.has(creator.id),
  }));

  return <CreatorsGrid rows={rows} />;
}
