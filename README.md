# Mendoza Hall

A self-contained Three.js r128 hallway for booth placement and room reservations on **Days 1–3**, with Cloudflare Pages Functions and Neon PostgreSQL.

## Deploy to Cloudflare Pages

### 1. Prepare Neon

Create a Neon PostgreSQL project/database. **The API now automatically creates missing application tables on first use** and repairs the missing `event_meta` initialization row. It also upgrades the original four-table setup by creating `event_meta` and `organizer_sessions`, without modifying existing assignments. Use a Neon database-owner connection for this initial setup.

Manual alternative: run all of [`schema.sql`](schema.sql) in Neon's SQL Editor against the database/branch you plan to connect, as its owner. It is idempotent. If you prefer a restricted runtime role with only DML rights, do this manual setup first, then grant that role access to all six tables.

Copy your Neon connection string (including `sslmode=require`). Prefer its pooled connection URL. Keep it private. **Do not paste credentials into HTML, JavaScript, Git, or chat.**

### 2. Configure Pages

Use a **Cloudflare Pages Git-connected project**, not a Workers static-assets project. The repository root must contain this application's files, not an enclosing ZIP folder.

| Setting | Value |
| --- | --- |
| Framework preset | None |
| Build command | `npm run build` |
| Build output directory | `public` |
| Root directory | Leave blank (repository root) |
| Node version | `22` (set `NODE_VERSION=22` if necessary) |

In **Settings → Variables and Secrets**, configure these for the deployment environment:

| Name | Type | Value |
| --- | --- | --- |
| `DATABASE_URL` | Secret | Neon PostgreSQL connection string |
| `ADMIN_PASSCODE` | Secret | A new, unique organizer passphrase, **16–256 characters** |

There is **no default production passcode**. The old public demo passcode is not used. Never expose these values through frontend/Vite variables. `SESSION_SECRET` is not required: sessions use cryptographically random, opaque tokens; only their SHA-256 hashes are stored in PostgreSQL.

**Do not enable `DEMO_MODE` in production.** Configure Production and Preview separately; use a separate Neon branch/database for previews. If deploying this work before merging, select the current pull request branch as the Pages deployment source/allowed preview branch. Cloudflare cannot build files that have not been published to the connected Git repository.

### 3. Deploy and verify

Save the secrets, then trigger a new deployment. Open the site and check:

1. `/api/state` returns JSON with `version: 3`, `revision`, and all three days. Public booth records **must not contain `notes`**.
2. The top-left connection indicator says **Live**, not Offline or LOCAL DEMO.
3. Click the lock, sign in, select a booth on the map, and save a test assignment.
4. Open another browser/incognito session. The assignment appears on refresh or within about 15 seconds; organizer notes do not.
5. Sign out. Organizer editing and private note fields disappear, and the server session is revoked.

Deploy using Git integration or Wrangler (`npx wrangler pages deploy public --project-name YOUR_PAGES_PROJECT`). Run `npm ci && npm run build` first when using Wrangler. Wrangler must run from this project root so it discovers `functions/`. **Uploading only `public/index.html`, or dashboard drag-and-drop of static files, does not deploy this API.**

The original “deployment failed to start” screenshot alone does not identify a Cloudflare control-plane error. If deployment still fails before build logs appear, retry the existing project deployment and check its Git integration/branch permissions. Once a build starts, use the build log to diagnose any remaining platform problem.

## Local development

Requires Node.js 22 or newer.

```sh
npm ci
cp .dev.vars.example .dev.vars
# Edit .dev.vars locally: set DATABASE_URL and ADMIN_PASSCODE.
# A database-owner connection permits automatic first-use setup.
# Alternatively, run schema.sql manually with an owner role first.
npm run dev
```

Open `http://localhost:8788`. The server binds to `0.0.0.0` and all browser requests use same-origin `/api/...` URLs, including in proxied previews.

### Explicit offline demonstration

To explore without database credentials:

```sh
npm run dev -- --binding DEMO_MODE=true
```

The connection indicator clearly says **LOCAL DEMO — this browser only**. The lock opens local editing without a password. Demo support is accepted only on localhost or the Arena preview host, never on `pages.dev` or a normal production custom domain. Local demo data is separate from the public production cache and is not shared. Private demo notes are not persisted either. A missing/non-JSON API **never automatically enables demo mode**.

## What is included

- The uploaded HTML/CSS interface, cleaned of copied Cloudflare challenge/analytics scripts.
- Procedural 3D hallway, room-side doors and windows, arcade arches and rails, road/garden, second-floor corridor, booths, and wandering/pettable cats.
- Drag-look, walk buttons/keyboard, room/org navigation, zoom, fullscreen when supported, and an interactive pan/zoom/touch SVG map.
- Welcome letter, per-day titles, booth colors/statuses/assignments, reservation papers, and organizer JSON export/import.
- `three@0.128.0` installed locally by npm; **no CDN or missing `three.min.js` upload required**. `build.mjs` bundles it into the page with the application.
- Pages Functions in `functions/api/[[path]].js`; runtime database access stays on the server.
- Same-origin API calls, bounded JSON requests, validation, parameterized SQL, login rate limits, expiring/revocable sessions, security headers, and generated script CSP hashes.
- Favicon and web manifest. No external models or texture images are needed.

## Hallway companions and custom artwork

All interface pictograms use the original local SVG artwork in `lib/icons.js`, including map cat markers. `build.mjs` resolves static icon placeholders at build time; runtime labels use SVG elements and text nodes, not HTML assembled from user data. Cat portraits and 3D coats share the seven built-in definitions.

- Open the paw button (or press **C**) for a compact action bar. **Meet the cats** expands portraits and friendship details; selecting a cat or taking an action folds those details away. Cats are also available in **Go to…** and through Enter/Space on map markers.
- The ginger cat **Pipoy** and grey cat **Graham** carry quiet remembrance notes in their profiles.
- **Walk over** brings you within greeting distance, using the stairs when necessary. **Call** makes a nearby cat approach you.
- **Pet** triggers a head lean, closed eyes, tail reaction and a floating purr. Proximity and a short cooldown prevent remote/spammed pets.
- **Follow** lets one cat follow along the current floor; stop from its card or the companion pill. Cats stay behind when you take the stairs.
- **Play** places a 3D yarn ball. Tap the hallway floor to roll it within six metres; the cat chases, pounces and bats it. Select **Pack yarn** to finish, or let the cat rest.
- Calling, petting, resting and playing briefly aim the camera toward the cat. Dragging or keyboard movement takes control back immediately.
- Friendship and pet counts are **in-memory for this visit only**. These public interactions never write to Neon, change booth assignments or require organizer login.

Behavior is independently tested in `tests/cats.test.js`; the browser suite checks companion controls, map keyboard access, mobile layout and the existing organizer flows.

## Saving, sync and privacy

- **Confirmed writes only:** labels and assignments change after API success; failed writes retain the form for review/retry. Failed saves never display a false success or celebration.
- **Concurrency:** every write requires the current revision (`If-Match`). A transaction-scoped PostgreSQL advisory lock plus guarded mutations prevents stale editors/imports from overwriting newer work. On conflict, the latest plan loads and the unsaved form stays open for review.
- **Bulk import:** validated in full before any write, then replaced in a single PostgreSQL transaction. All three days must be present. Import and reset require an organizer session.
- **Synchronization:** poll every 15 seconds while visible; retry initial/outage failures with backoff. Offline shared plans are read-only. A full tab reload requires organizer sign-in again.
- **Privacy:** public SQL selects omit `notes`; localStorage contains only public plan data. Authenticated notes and bearer tokens stay in memory. Logout clears private state and note input fields and revokes the server token; tokens otherwise expire after 8 hours.
- **Public information:** organization, representative, description, status/color, room reservation text, and room notes are public by design. Do not enter confidential data there. Only booth **LSC notes** are organizer-only.
- **Organizer downloads include private notes.** Treat assignment exports as confidential backups.
- All mutation routes require authorization; hiding the editor is not the security boundary. Successful login attempts also count toward the 10-attempt/15-minute per-IP login limit. Large groups behind one public IP should avoid repeatedly signing in at once.
- Change the organizer passphrase in Cloudflare and redeploy to rotate it. To revoke all existing sessions immediately, run `DELETE FROM organizer_sessions;` in Neon. Session verification uses database time.
- API errors deliberately do not reveal connection strings, SQL, raw driver messages or user data. The response supplies an allowlisted diagnostic code and error reference; Cloudflare Function logs record only that reference, the diagnostic code and a SQLSTATE when available. All database HTTP traffic is server-side.

## Automatic setup and data safety

When a normal API query reports PostgreSQL `42P01` (missing table), or the state load finds no `event_meta` initialization row, the API:

1. Opens a **separate, read-write transaction** (not the read-only state snapshot).
2. Acquires the same transaction-scoped advisory lock used by assignment writes. Concurrent Workers cannot race to create the schema.
3. Executes only the bundled `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, and metadata `INSERT ... ON CONFLICT DO NOTHING` statements.
4. Commits, then retries **only the failed query/transaction, once**. A login whose session table was missing is not counted twice.

Existing tables are **not dropped, altered, cleared, renamed or overwritten**. Existing assignment text, private notes, day titles, reservations, revisions and sessions survive setup. An incompatible existing column is deliberately **not** guessed at or destructively rebuilt. Manual migration is required for a genuinely different table shape.

Setup rolls back completely on failure, has lock/statement timeouts, and is never triggered by a bad password, invalid database credentials, network errors, normal DML permission errors or missing columns. Healthy requests do not run DDL. `/api/health` remains read-only. SQL never comes from the browser; all setup statements are bundled with the server code and match `schema.sql` in automated tests.

The test suite starts with both **an entirely empty PostgreSQL database** and **the original four-table schema with real saved data**, exercises automatic setup, then logs in and saves assignments. An additional test uses the **actual Neon HTTP client** end to end against embedded PostgreSQL, covering lazy query serialization, read-only vs setup transaction options, PostgreSQL type parsing, auth, saving and logout. Browser tests cover both database starting states. These checks run on pull requests via `.github/workflows/check.yml` without production credentials.

## Source layout

```text
index.src.html       interface template
app.js               browser interaction, rendering and synchronization
lib/model.js         shared layout and validation
lib/auth.js          server credential/token helpers
functions/api/       Pages API catch-all
schema.sql           optional manual, idempotent database setup
lib/schema.js        matching bundled setup statements (checked by tests)
lib/setup.js         transactional, additive missing-table recovery
build.mjs            offline bundle + CSP generation
public/              favicon/manifest; generated index and headers on build
wrangler.toml        Pages output/compatibility configuration
```

Generated `public/index.html`, `_headers`, and `_routes.json` are ignored by Git and recreated during build. Do not hand-edit them. `.dev.vars`, `.env`, dependencies, and local testing artifacts are ignored. There are no production credentials in this repository.

## Verification

```sh
npm test                 # model/auth + API tests against embedded PostgreSQL
npm run check            # those tests, production bundle, Pages Functions compilation
npx playwright install chromium
npm run test:browser     # browser tests, starts/reuses a local Pages server
```

The browser tests exercise graphics startup, organizer login, actual SQL-backed saves through the production handler, failed requests, stale revisions, public cache filtering, server logout, upstairs navigation, mobile layout, and explicit-demo vs missing-API behavior. SQL integration tests use PGlite (embedded PostgreSQL), not mock SQL return values. Browser API traffic is routed to the production handler with that test database; no live Neon credentials are required.

**Live Neon/Cloudflare deployment is not verified by the local tests.** You must configure the secrets/role above and complete the deployment checks on your own account. Browser tests require WebGL (hardware acceleration or software rendering).

## Troubleshooting

### “Database unavailable or schema missing” after setting the secrets

The previous version used that same generic message for **every** runtime exception. It did not establish whether Neon was reachable or whether tables were actually missing. A successful Pages build does not verify the runtime database connection.

In this version, select **Database issue — details → Check connection**, or open **`/api/health`** on the deployed site. This is a read-only, unauthenticated diagnostic that checks the actual runtime connection, required public tables/columns, role permissions and metadata initialization. It returns no credentials, assignments, private notes, database host/name or connection URL.

| Code | What to do |
| --- | --- |
| `DB_NOT_CONFIGURED` | Set `DATABASE_URL` in the environment used by the URL you are visiting (Production vs Preview), then redeploy. |
| `DB_URL_INVALID` | Copy **only** the complete PostgreSQL connection URL from Neon Connect. Do not include `psql`, `DATABASE_URL=`, shell quotes or a Neon API key. Surrounding whitespace is trimmed. |
| `DB_AUTH_FAILED` | Copy a fresh URL for the correct Neon role/password, update the secret and redeploy. |
| `DB_SCHEMA_MISSING` / `DB_SCHEMA_INCOMPLETE` | Reload the application (`/api/state` attempts additive setup). `/api/health` is read-only, so it can report missing tables before the first app request. If setup cannot complete, use an owner connection or run the latest full schema once on the same branch/database. |
| `DB_SCHEMA_OUTDATED` | Compare the reported missing columns with `schema.sql`; `CREATE TABLE IF NOT EXISTS` does not add columns to an existing differently shaped table. Back up data before a targeted migration; do not delete tables. |
| `DB_SCHEMA_UNINITIALIZED` | The app repairs this missing initialization row on its next state request. The manual equivalent is the `INSERT INTO public.event_meta ... ON CONFLICT DO NOTHING` statement in `schema.sql`. |
| `DB_SETUP_PERMISSION_DENIED` | The connection works, but this role cannot create missing tables/indexes. Use a Neon database-owner connection for initial setup, or run the full `schema.sql` as owner in the same branch/database. Existing assignments are untouched. |
| `DB_SETUP_BUSY` | Setup hit a lock or statement timeout. Retry shortly; the setup transaction rolls back safely and can be repeated. |
| `DB_PERMISSION_DENIED` | Use a role with access to the public schema and SELECT/INSERT/UPDATE/DELETE rights on all six application tables. |
| `DB_DATABASE_NOT_FOUND` | The URL points to a database that does not exist on that Neon endpoint. Select the intended branch/database in Neon Connect and copy its URL. |
| `DB_CONNECTION_FAILED` / `DB_STARTING` | Check the Neon endpoint state, network/IP restrictions, and current URL; retry after the endpoint wakes up. |
| `API_INTERNAL_ERROR` / `DB_REQUEST_FAILED` | Use the displayed error reference to locate the safe code/SQLSTATE in Cloudflare Function logs; do not assume the schema is wrong. |

**The original uploaded schema had four tables. This app needs six**, including `event_meta` and `organizer_sessions`, plus the single `event_meta` row. Merely adding a Cloudflare environment variable did not execute SQL in older versions. This version runs the bundled additive setup automatically when an application query reports a missing table or missing metadata row. Rerunning the current `schema.sql` manually remains non-destructive for the intended schema. The application and schema explicitly use `public` so a role's custom `search_path` cannot silently select the wrong tables.

To check the six tables directly in Neon's SQL Editor, select the intended branch/database and run this read-only query:

```sql
SELECT name, to_regclass('public.' || name) AS present
FROM unnest(ARRAY[
  'event_days', 'booth_assignments', 'room_reservations',
  'login_attempts', 'event_meta', 'organizer_sessions'
]) AS required(name);
```

A `null` in `present` means that table is absent on the database you selected. If all six are present there but `/api/health` reports missing tables, check that the deployed URL uses that exact Neon branch/database and a role with access. You can share the diagnostic code, missing table/column names, and error reference for troubleshooting; **never share `DATABASE_URL`, passwords or passcodes**.


| Symptom | Check |
| --- | --- |
| Build cannot find a template | Filename must be exactly `index.src.html`, not `index.src 2.html`. |
| `npm run build` missing | Ensure Pages is building this project folder/branch and the complete source is published. |
| Database not configured / 503 | Set runtime `DATABASE_URL`, verify database/branch and deploy this version. Missing tables are created automatically if the role can create them; otherwise run `schema.sql` manually as owner. |
| API returns HTML | Confirm Pages Functions were deployed; static-only upload does not include them. |
| Organizer login configuration error | Set `ADMIN_PASSCODE` to 16–256 characters and redeploy. |
| Login returns 429 | Wait 15 minutes for the shared-IP rate limit window. |
| “Someone changed the plan” | Review the freshly loaded plan and your retained form, then retry. |
| Hallway cannot start | Enable JavaScript/WebGL and hardware acceleration; use a current browser. |
| LOCAL DEMO indicator | This is not Neon-backed. Remove demo mode and configure the real development/production database. |
