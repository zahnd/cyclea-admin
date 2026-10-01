import "server-only";

import { readFileSync } from "node:fs";
import path from "node:path";

import { Pool } from "pg";

// The Cyclea APP project, as the `admin_portal` Postgres role. Postgres -- not
// this code -- limits it to SELECT on creator_revenue_events and SELECT,
// INSERT, UPDATE(name, active, note) on creators (docs/architecture.md § The
// credential boundary). Not "read-only": it creates and edits creators.
//
// Session-mode pooler (port 5432), so a small pool: every connection held here
// is a server connection held there.

const CA_PATH = path.join(process.cwd(), "lib/db/supabase-ca.crt");

// Dev hot reloads re-evaluate this module; without the global each reload
// would open another pool against a deliberately small pooler.
const cache = globalThis as unknown as { appDbPool?: Pool };

function createPool(): Pool {
  const raw = process.env.CYCLEA_APP_DATABASE_URL;
  if (!raw) {
    throw new Error("CYCLEA_APP_DATABASE_URL is not set. See .env.example and docs/setup.md.");
  }

  let ca: string;
  try {
    ca = readFileSync(CA_PATH, "utf8");
  } catch {
    throw new Error(`Supabase CA certificate missing at ${CA_PATH}. See docs/setup.md.`);
  }

  // Parsed by hand rather than passed as connectionString, so an `sslmode` in
  // the URL cannot quietly change how the certificate is checked.
  const url = new URL(raw);
  return new Pool({
    host: url.hostname,
    port: Number(url.port || 5432),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1) || "postgres",
    // Verified against Supabase's own CA. The connection probe skipped this;
    // a production connection carrying admin writes must not.
    ssl: { ca, rejectUnauthorized: true },
    max: 3,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
}

export function appDbAsAdminPortal(): Pool {
  cache.appDbPool ??= createPool();
  return cache.appDbPool;
}
