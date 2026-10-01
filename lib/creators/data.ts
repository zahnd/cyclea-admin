import "server-only";

import { adminDb } from "@/lib/db/admin";
import { appDbAsAdminPortal } from "@/lib/db/app";

// A creator is one uuid in two databases (docs/architecture.md § Creator
// identity spans both projects). These read each side separately; joining
// happens here, in the server, because Postgres cannot join across projects.

export type AppCreator = {
  id: string;
  code: string;
  name: string;
  active: boolean;
  createdAt: string;
  /** The app project's own note column. Shown, never written from here. */
  appNote: string | null;
};

export type CreatorRecord = {
  id: string;
  createdAt: string;
  contractSignedOn: string | null;
  payeeReference: string | null;
  internalNote: string | null;
};

type AppRow = {
  id: string;
  code: string;
  name: string;
  active: boolean;
  created_at: Date;
  note: string | null;
};

function toAppCreator(row: AppRow): AppCreator {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    active: row.active,
    createdAt: row.created_at.toISOString(),
    appNote: row.note,
  };
}

export async function listAppCreators(): Promise<AppCreator[]> {
  const { rows } = await appDbAsAdminPortal().query<AppRow>(
    "SELECT id, code, name, active, created_at, note FROM public.creators ORDER BY created_at",
  );
  return rows.map(toAppCreator);
}

export async function getAppCreator(id: string): Promise<AppCreator | null> {
  const { rows } = await appDbAsAdminPortal().query<AppRow>(
    "SELECT id, code, name, active, created_at, note FROM public.creators WHERE id = $1",
    [id],
  );
  return rows[0] ? toAppCreator(rows[0]) : null;
}

type RecordRow = {
  id: string;
  created_at: string;
  contract_signed_on: string | null;
  payee_reference: string | null;
  internal_note: string | null;
};

const RECORD_COLUMNS = "id, created_at, contract_signed_on, payee_reference, internal_note";

function toRecord(row: RecordRow): CreatorRecord {
  return {
    id: row.id,
    createdAt: row.created_at,
    contractSignedOn: row.contract_signed_on,
    payeeReference: row.payee_reference,
    internalNote: row.internal_note,
  };
}

export async function listCreatorRecords(): Promise<CreatorRecord[]> {
  const { data, error } = await adminDb().from("creators").select(RECORD_COLUMNS);
  if (error) throw new Error(`creator records: ${error.message}`);
  return (data as RecordRow[]).map(toRecord);
}

export async function getCreatorRecord(id: string): Promise<CreatorRecord | null> {
  const { data, error } = await adminDb()
    .from("creators")
    .select(RECORD_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`creator record: ${error.message}`);
  return data ? toRecord(data as RecordRow) : null;
}

export type MonthlyReferrals = { month: string; referrals: number };

/**
 * Referrals per month for one creator, newest first, from the app project's
 * creator_referral_counts view (app migration 0059): aggregate only, nothing
 * finer than a month, never a user id.
 */
export async function listReferralCounts(creatorId: string): Promise<MonthlyReferrals[]> {
  // `month` comes back as text: pg turns a date column into a JS Date at the
  // server's LOCAL midnight, and toISOString() then moves 1 October to
  // 30 September anywhere east of UTC.
  const { rows } = await appDbAsAdminPortal().query<{ month: string; referrals: number }>(
    "SELECT to_char(month, 'YYYY-MM-DD') AS month, referrals FROM public.creator_referral_counts WHERE creator_id = $1 ORDER BY month DESC",
    [creatorId],
  );
  return rows.map((row) => ({ month: row.month, referrals: Number(row.referrals) }));
}

export type CreatorLogin = { userId: string; email: string };

/** The account that signs in to the portal as this creator, if any. */
export async function getCreatorLogin(creatorId: string): Promise<CreatorLogin | null> {
  const { data, error } = await adminDb()
    .from("creator_logins")
    .select("user_id")
    .eq("creator_id", creatorId)
    .maybeSingle();
  if (error) throw new Error(`creator login: ${error.message}`);
  if (!data) return null;
  const userId = (data as { user_id: string }).user_id;
  const { data: user } = await adminDb().auth.admin.getUserById(userId);
  return { userId, email: user.user?.email ?? "(no email)" };
}
