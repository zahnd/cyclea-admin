# cyclea-admin

The admin platform for [Cyclea](https://github.com/zahnd/cyclea-app): creator
referral payouts first, other administrative actions as they are needed, and a
creator self-serve portal.

Two audiences, one codebase: `/admin` for us, `/portal` for creators.

- **Architecture and the rules that constrain it** — `docs/architecture.md`
- **First-time setup** — `docs/setup.md`
- **Working here with Claude Code** — `CLAUDE.md`

The decision record for *why* this is a separate repo and a separate database
lives in the app repo, at `cyclea-app/docs/admin-platform.md`.

> **The one rule worth reading before any code.** Nothing this app holds may be
> able to read health data. The app database is reached through one narrow
> Postgres role and one view; a Supabase service-role key for the app project
> must never exist in this repo, in Render's environment, or in a `.env` file on
> anyone's laptop. See `docs/architecture.md` § *The credential boundary*.
