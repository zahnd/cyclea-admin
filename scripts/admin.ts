// Admin bootstrap and recovery, run by hand on a trusted machine:
//
//   npm run admin -- grant <email>       make <email> an admin (creates the account)
//   npm run admin -- reset-mfa <email>   remove <email>'s authenticator
//
// Reads SUPABASE_URL and SUPABASE_SECRET_KEY from .env.local -- the ADMIN
// project's secret key, never the app project's. Every change is written to
// audit_log with actor "system:admin-script:<os user>".

import { userInfo } from "node:os";

import { createClient, type User } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!url || !secretKey) {
  console.error("SUPABASE_URL and SUPABASE_SECRET_KEY must be set (.env.local).");
  process.exit(1);
}

const db = createClient(url, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const actorLabel = `system:admin-script:${userInfo().username}`;

async function findUser(email: string): Promise<User | null> {
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const user = data.users.find((u) => u.email?.toLowerCase() === email);
    if (user) return user;
    if (data.users.length < 1000) return null;
  }
}

async function grant(email: string) {
  let user = await findUser(email);
  if (!user) {
    // Confirmed up front: the first sign-in is a code to this address anyway,
    // which proves ownership the same way a confirmation link would.
    const { data, error } = await db.auth.admin.createUser({ email, email_confirm: true });
    if (error) throw error;
    user = data.user;
    console.log(`Created account ${email} (${user.id}).`);
  }

  const { data: granted, error } = await db.rpc("grant_admin", {
    p_user_id: user.id,
    p_actor_id: null,
    p_actor_label: actorLabel,
  });
  if (error) throw error;
  console.log(granted ? `${email} is now an admin.` : `${email} was already an admin; nothing changed.`);
}

async function resetMfa(email: string) {
  const user = await findUser(email);
  if (!user) throw new Error(`No account for ${email}.`);

  const { data, error } = await db.auth.admin.mfa.listFactors({ userId: user.id });
  if (error) throw error;
  const totp = data.factors.filter((f) => f.factor_type === "totp");

  for (const factor of totp) {
    const { error: deleteError } = await db.auth.admin.mfa.deleteFactor({ id: factor.id, userId: user.id });
    if (deleteError) throw deleteError;
  }

  // Auth is an API, not a table, so this cannot share a transaction with the
  // deletions. Written only after they all succeeded.
  const { error: auditError } = await db.from("audit_log").insert({
    actor_label: actorLabel,
    action: "admin.reset_mfa",
    target_type: "admin",
    target_id: user.id,
    details: { email, factors_removed: totp.length },
  });
  if (auditError) throw auditError;

  console.log(`Removed ${totp.length} authenticator(s) for ${email}; they will set up a new one at next sign-in.`);
}

const [command, rawEmail] = process.argv.slice(2);
const email = rawEmail?.trim().toLowerCase();

const commands: Record<string, (email: string) => Promise<void>> = {
  grant,
  "reset-mfa": resetMfa,
};

if (!command || !commands[command] || !email) {
  console.error("Usage: npm run admin -- <grant|reset-mfa> <email>");
  process.exit(1);
}

commands[command](email).catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
