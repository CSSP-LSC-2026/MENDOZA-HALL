# Mendoza Hall

A self-contained Three.js r128 hallway for booth placement and room reservations on **Days 1–3**, with Cloudflare Pages Functions and Neon PostgreSQL.

## Deploy to Cloudflare Pages

### 1. Prepare Neon

Create a Neon PostgreSQL project/database. Run **all of [`schema.sql`](schema.sql)** in Neon's SQL Editor, against the database/branch you plan to connect. It is idempotent and can be rerun if you previously ran the older schema. It adds the revision and organizer-session tables required by this version.

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

**Do not enable `DEMO_MODE` in production.** Configure Production and Preview separately; use a separate Neon branch/database for previews. If deploying this work before merging, select this session's branch (`arena/d208e5ff-mendoza-hall`) as the Pages deployment source/allowed preview branch. Cloudflare cannot build files that have not been published to the connected Git repository.

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
# Run schema.sql on that development Neon database first.
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
- API errors deliberately do not reveal connection strings, SQL, or driver diagnostics. Inspect Cloudflare/Neon configuration privately. All database HTTP traffic is server-side.

## Source layout

```text
index.src.html       interface template
app.js               browser interaction, rendering and synchronization
lib/model.js         shared layout and validation
lib/auth.js          server credential/token helpers
functions/api/       Pages API catch-all
schema.sql           required, idempotent database setup
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

**Live Neon/Cloudflare deployment is not verified by the local tests.** You must configure the secrets/schema above and complete the deployment checks on your own account. Browser tests require WebGL (hardware acceleration or software rendering).

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Build cannot find a template | Filename must be exactly `index.src.html`, not `index.src 2.html`. |
| `npm run build` missing | Ensure Pages is building this project folder/branch and the complete source is published. |
| Database not configured / 503 | Set runtime `DATABASE_URL`, run all of `schema.sql`, verify database/branch and redeploy. |
| API returns HTML | Confirm Pages Functions were deployed; static-only upload does not include them. |
| Organizer login configuration error | Set `ADMIN_PASSCODE` to 16–256 characters and redeploy. |
| Login returns 429 | Wait 15 minutes for the shared-IP rate limit window. |
| “Someone changed the plan” | Review the freshly loaded plan and your retained form, then retry. |
| Hallway cannot start | Enable JavaScript/WebGL and hardware acceleration; use a current browser. |
| LOCAL DEMO indicator | This is not Neon-backed. Remove demo mode and configure the real development/production database. |
