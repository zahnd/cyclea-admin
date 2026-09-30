/**
 * TEMPORARY — connection probe. Delete this file, package.json and
 * package-lock.json when the Next.js app is scaffolded over them.
 *
 * It answers the one question that could still change the architecture
 * (docs/setup.md): can the `admin_portal` role reach the Cyclea App project
 * from a *deployed Render service*? A laptop reaches Supabase over IPv6 and
 * proves nothing about Render's IPv4 egress.
 *
 * It also asserts the boundary rather than assuming it. Three of the checks
 * below are NEGATIVE: they must fail with 42501 (insufficient_privilege). A
 * negative check that fails with 42P01 (undefined_table) proves nothing — the
 * table simply is not there — so it is reported as INCONCLUSIVE, not as a pass.
 * That distinction is the whole value of the probe: without it, a typo in a
 * table name looks exactly like a correctly locked-down role.
 *
 * Results go to stdout (Render logs are private). The HTTP response is
 * deliberately almost empty, because this service has a public URL.
 */
const http = require('node:http');
const { Client } = require('pg');

const PORT = process.env.PORT || 10000;
const DENIED = '42501';       // insufficient_privilege
const NO_TABLE = '42P01';     // undefined_table

let summary = { state: 'running' };

/** Runs one query; returns {ok, rows} or {ok:false, code, message}. */
async function attempt(client, sql) {
  try {
    const res = await client.query(sql);
    return { ok: true, rows: res.rows };
  } catch (e) {
    return { ok: false, code: e.code, message: e.message };
  }
}

/**
 * Explains a connection string without ever printing the password.
 *
 * `pg` parses the string inside the Client constructor, so a malformed one
 * throws "Invalid URL" before a single packet is sent -- which reads like a
 * network problem and is not one. The usual cause is an unencoded character in
 * the password: `/` ends the userinfo and starts the path, and `@ ? # [ ]` are
 * each structural too. A base64 password (openssl rand -base64) hits this
 * roughly half the time, which is why hex is the safer generator.
 */
function diagnoseUrl(raw) {
  const notes = [];
  if (raw !== raw.trim()) notes.push('has leading/trailing whitespace');
  if (/\s/.test(raw.trim())) notes.push('contains an internal space or newline');
  if (!/^postgres(ql)?:\/\//.test(raw.trim())) notes.push('does not start with postgresql://');
  if (/\[|\]/.test(raw)) notes.push('contains [ or ] -- a leftover [YOUR-PASSWORD] placeholder?');

  // Isolate the userinfo without keeping it: everything between :// and the
  // LAST @, which is the host separator even when the password contains one.
  const afterScheme = raw.trim().replace(/^postgres(ql)?:\/\//, '');
  const at = afterScheme.lastIndexOf('@');
  if (at === -1) {
    notes.push('has no @ separating credentials from host');
  } else {
    const userinfo = afterScheme.slice(0, at);
    const colon = userinfo.indexOf(':');
    const user = colon === -1 ? userinfo : userinfo.slice(0, colon);
    const pass = colon === -1 ? '' : userinfo.slice(colon + 1);
    notes.push(`username is "${user}"`);
    if (!user.includes('.')) {
      notes.push('username has no dot -- the pooler needs <role>.<project-ref>');
    }
    if (!pass) {
      notes.push('password is empty');
    } else {
      const bad = [...new Set(pass.split('').filter((c) => '/?#[]@ '.includes(c)))];
      notes.push(`password length ${pass.length}`);
      if (bad.length) {
        notes.push(
          `password contains ${bad.map((c) => `"${c}"`).join(', ')} which must be ` +
          'percent-encoded -- simplest fix is a hex password: openssl rand -hex 32',
        );
      }
    }
    notes.push(`host:port/db is "${afterScheme.slice(at + 1)}"`);
  }
  return notes;
}

async function probe() {
  const url = process.env.CYCLEA_APP_DATABASE_URL;
  if (!url) {
    return { pass: false, fatal: 'CYCLEA_APP_DATABASE_URL is not set' };
  }

  try {
    // eslint-disable-next-line no-new
    new URL(url.trim());
  } catch {
    for (const n of diagnoseUrl(url)) console.log(`[probe]   - ${n}`);
    return { pass: false, fatal: 'CYCLEA_APP_DATABASE_URL is not a valid URL (see notes above)' };
  }

  let client;
  try {
    client = new Client({
      connectionString: url,
      // Test-only. The real app should verify against Supabase's CA rather than
      // skipping verification; this is here so a cert problem cannot be
      // confused with the reachability question the probe exists to answer.
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 15000,
      query_timeout: 15000,
    });
  } catch (e) {
    // pg parses the connection string HERE, not in connect().
    for (const n of diagnoseUrl(url)) console.log(`[probe]   - ${n}`);
    return { pass: false, fatal: `could not build a client [${e.message}]` };
  }

  try {
    await client.connect();
  } catch (e) {
    if (/invalid url/i.test(e.message)) {
      for (const n of diagnoseUrl(url)) console.log(`[probe]   - ${n}`);
    }
    // THE answer we are here for, when it fails: ENETUNREACH/ETIMEDOUT means
    // the host is unreachable from Render (IPv6), 28P01 means the role or
    // password is wrong, 'Tenant or user not found' means the pooler did not
    // accept the <role>.<project-ref> username form.
    return { pass: false, fatal: `connect failed [${e.code || '-'}]: ${e.message}` };
  }

  const results = [];
  const positive = async (name, sql) => {
    const r = await attempt(client, sql);
    results.push({ name, expect: 'allowed', pass: r.ok,
                   detail: r.ok ? JSON.stringify(r.rows[0]) : `${r.code}: ${r.message}` });
  };
  const negative = async (name, sql) => {
    const r = await attempt(client, sql);
    if (r.ok) {
      results.push({ name, expect: 'denied', pass: false,
                     detail: 'SUCCEEDED — the role is too wide. Revoke it.' });
    } else if (r.code === DENIED) {
      results.push({ name, expect: 'denied', pass: true, detail: 'permission denied (correct)' });
    } else if (r.code === NO_TABLE) {
      results.push({ name, expect: 'denied', pass: null,
                     detail: 'INCONCLUSIVE — table does not exist, so this proves nothing' });
    } else {
      results.push({ name, expect: 'denied', pass: null, detail: `unexpected ${r.code}: ${r.message}` });
    }
  };

  await positive('identity',      'SELECT current_user, inet_server_addr()::text AS server_ip');
  await positive('read the view', 'SELECT count(*) AS rows FROM public.creator_revenue_events');
  await positive('read creators', 'SELECT count(*) AS rows FROM public.creators');

  // The boundary. Each of these MUST be denied.
  await negative('cycles',               'SELECT 1 FROM public.cycles LIMIT 1');
  await negative('daily_logs',           'SELECT 1 FROM public.daily_logs LIMIT 1');
  await negative('daily_log_selections', 'SELECT 1 FROM public.daily_log_selections LIMIT 1');
  await negative('profiles',             'SELECT 1 FROM public.profiles LIMIT 1');
  // Only the view was granted, never the base table it reads.
  await negative('revenuecat_events',    'SELECT 1 FROM public.revenuecat_events LIMIT 1');

  // Writing to creators is a grant we do want. Rolled back, so no junk row.
  const tx = await attempt(client, 'BEGIN');
  if (tx.ok) {
    const ins = await attempt(client,
      "INSERT INTO public.creators (code, name) VALUES ('PROBE_ROLLBACK', 'probe') RETURNING id");
    results.push({ name: 'insert a creator', expect: 'allowed', pass: ins.ok,
                   detail: ins.ok ? 'inserted, rolling back' : `${ins.code}: ${ins.message}` });
    await attempt(client, 'ROLLBACK');
  }

  await client.end();

  const failed = results.filter((r) => r.pass === false);
  const unclear = results.filter((r) => r.pass === null);
  return { pass: failed.length === 0 && unclear.length === 0, results, failed: failed.length, unclear: unclear.length };
}

// Bind the port FIRST. Render fails a deploy that does not listen in time, and
// the probe takes several seconds when the answer is a connection timeout.
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ state: summary.state, pass: summary.pass ?? null, see: 'render logs' }));
}).listen(PORT, () => {
  console.log(`[probe] listening on ${PORT}; starting connection probe`);
  probe()
    .then((out) => {
      summary = { state: 'done', pass: out.pass };
      if (out.fatal) {
        console.error(`[probe] FATAL ${out.fatal}`);
        return;
      }
      for (const r of out.results) {
        const mark = r.pass === true ? 'PASS' : r.pass === false ? 'FAIL' : '????';
        console.log(`[probe] ${mark}  ${r.name.padEnd(22)} ${r.detail}`);
      }
      console.log(
        out.pass
          ? '[probe] ALL CHECKS PASSED — the pooler path works and the role is narrow'
          : `[probe] NOT CLEAN — ${out.failed} failed, ${out.unclear} inconclusive`,
      );
    })
    .catch((e) => {
      summary = { state: 'error', pass: false };
      console.error('[probe] threw:', e.message);
    });
});
