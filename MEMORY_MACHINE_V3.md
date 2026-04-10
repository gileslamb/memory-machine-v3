# Memory Machine v3 — project reference

**Purpose:** Single-user personal project management and context system (Giles). Replaces v2’s browser `localStorage` approach with **Neon Postgres** and a small Next.js app. Deployed on **Vercel**; usable from any device after password unlock.

**Use this file:** Paste or attach when asking Claude (or another assistant) to work on this repo, review architecture, or integrate with the HTTP API.

---

## Tech stack

| Layer | Choice |
|--------|--------|
| Framework | Next.js 14 (App Router), TypeScript |
| UI | React 18, **inline styles only** (no Tailwind) |
| Database | **Neon** Postgres via `@neondatabase/serverless` |
| Queries | **Raw SQL** (tagged template); no Prisma/ORM |
| Auth | No NextAuth/JWT/cookies. Password gate + optional API key |
| AI | Anthropic **Messages API**, model `claude-sonnet-4-20250514` for log → project state |

---

## Repository layout

```
app/
  layout.tsx              # Metadata, global CSS import
  page.tsx                # Renders MemoryMachineApp
  globals.css             # Base resets, body typography
  api/
    verify/route.ts       # POST — password check (unauthenticated)
    init/route.ts         # POST — DDL + seed (authenticated)
    projects/route.ts     # GET, POST
    projects/[id]/route.ts # PATCH
    logs/route.ts         # GET, POST
    logs/[id]/route.ts    # DELETE
    timesheet/route.ts    # GET, POST
    stable/route.ts       # GET, POST
    archive/route.ts      # GET, POST
    export/route.ts       # GET — plain-text markdown
components/
  MemoryMachineApp.tsx    # Password gate + all tabs (client component)
lib/
  db.ts                   # `getSql()` → neon(DATABASE_URL)
  auth.ts                 # Bearer + x-memory-machine-api-key
  claude.ts               # `extractProjectState()` → Anthropic
  duration.ts             # Parses 2h, 90m, 1.5 (hours), integer minutes
  ids.ts                  # `crypto.randomUUID()` for new rows
```

Path alias: `@/*` → project root (`tsconfig`).

---

## Authentication

### Browser (human)

1. User enters password on the client.
2. `POST /api/verify` with JSON `{ "password": "…" }` compares to `MEMORY_MACHINE_PASSWORD` (no Bearer required).
3. On success, client sets `sessionStorage`:
   - `mm_authenticated` = `"1"`
   - `mm_token` = the password string (same value used for API calls).

All subsequent API calls from the UI send:

```http
Authorization: Bearer <MEMORY_MACHINE_PASSWORD value stored as mm_token>
```

### Automation / “Claude posts logs”

Set `MEMORY_MACHINE_API_KEY` to a long random secret. Send either:

```http
Authorization: Bearer <MEMORY_MACHINE_API_KEY>
```

or

```http
x-memory-machine-api-key: <MEMORY_MACHINE_API_KEY>
```

**Authorization rule:** A request is allowed if the token equals `MEMORY_MACHINE_PASSWORD` **or** (if set) `MEMORY_MACHINE_API_KEY`.

**Exceptions:** Only `POST /api/verify` is public. Every other route in `app/api/*` (except verify) calls `isAuthorized()`.

---

## Environment variables

| Variable | Required for | Notes |
|----------|----------------|-------|
| `DATABASE_URL` | DB reads/writes | Neon connection string |
| `MEMORY_MACHINE_PASSWORD` | Login + API from browser | Must be set or verify returns 500 |
| `MEMORY_MACHINE_API_KEY` | Optional | External tools; if empty, only password works for API |
| `ANTHROPIC_API_KEY` | Project state updates | Required when posting logs **with** `project_id` and Claude path runs |

Local: use `.env.local` (gitignored). Production: set in Vercel project settings.

---

## Database schema

Created by **`POST /api/init`** (`CREATE TABLE IF NOT EXISTS` + idempotent seed).

### `projects`

| Column | Type | Notes |
|--------|------|--------|
| `id` | TEXT PK | UUIDs for user-created rows; seed rows use `seed-*` ids |
| `name` | TEXT NOT NULL | |
| `description` | TEXT | |
| `status` | TEXT | Default `'active'`; also `'archived'` |
| `current_state` | TEXT | Markdown snapshot; updated by log ingestion + Claude |
| `created_at` | TIMESTAMPTZ | Default `NOW()` |
| `updated_at` | TIMESTAMPTZ | Default `NOW()`; bumped on PATCH and state extraction |

### `logs`

| Column | Type | Notes |
|--------|------|--------|
| `id` | TEXT PK | |
| `content` | TEXT NOT NULL | |
| `project_id` | TEXT FK → `projects(id)` | Nullable |
| `created_at` | TIMESTAMPTZ | Default `NOW()` |

### `timesheet`

| Column | Type | Notes |
|--------|------|--------|
| `id` | TEXT PK | |
| `project_id` | TEXT FK → `projects(id)` | |
| `duration_minutes` | INTEGER NOT NULL | |
| `notes` | TEXT | |
| `logged_at` | TIMESTAMPTZ | Default `NOW()` |

### `stable_context`

| Column | Type | Notes |
|--------|------|--------|
| `id` | TEXT PK | Default `'main'` in DDL; app uses single row `id = 'main'` |
| `content` | TEXT NOT NULL | |
| `updated_at` | TIMESTAMPTZ | Default `NOW()` |

### `weekly_archive`

| Column | Type | Notes |
|--------|------|--------|
| `id` | TEXT PK | |
| `week_label` | TEXT NOT NULL | e.g. week range string (Monday-based week) |
| `logs_snapshot` | TEXT NOT NULL | JSON string of archived log rows |
| `synthesis` | TEXT | Nullable |
| `archived_at` | TIMESTAMPTZ | Default `NOW()` |

---

## Seed projects (init)

Inserted with `ON CONFLICT (id) DO NOTHING`:

| `id` | `name` |
|------|--------|
| `seed-dream-screens` | Dream Screens |
| `seed-signal-dreams` | Signal Dreams |
| `seed-curious-dreamers` | Curious Dreamers |
| `seed-commissions` | Commissions |
| `seed-life-admin` | Life Admin |

Descriptions are set in `app/api/init/route.ts`.

---

## HTTP API reference

Base URL: same origin as the app (e.g. `https://<deployment>.vercel.app` or `http://localhost:3000`).

Unless noted, send **`Authorization: Bearer …`** as above.

### `POST /api/verify`

- **Auth:** None.
- **Body:** `{ "password": string }`
- **Response:** `{ "ok": true | false }`. If `MEMORY_MACHINE_PASSWORD` is unset, `500` with error JSON.

### `POST /api/init`

- **Auth:** Required.
- **Effect:** Creates tables if missing; ensures `stable_context` row `main`; seeds projects.
- **Response:** `{ ok: true, message: string }` or `{ error: string }`.

### `GET /api/projects`

- **Auth:** Required.
- **Response:** JSON array of project rows, `ORDER BY updated_at DESC`.

### `POST /api/projects`

- **Auth:** Required.
- **Body:** `{ "name": string, "description"?: string }`
- **Response:** Created project object.

### `PATCH /api/projects/:id`

- **Auth:** Required.
- **Body:** any of `{ "name"?, "description"?, "current_state"?, "status"? }` where `status` ∈ `active` | `archived`.
- **Effect:** Merges with existing row; always sets `updated_at = NOW()`.
- **Response:** Updated project or `404`.

### `GET /api/logs`

- **Auth:** Required.
- **Query:** optional `?project_id=<id>`
- **Response:** JSON array, newest first.

### `POST /api/logs`

- **Auth:** Required (password or API key — intended for external Claude/scripts via API key).
- **Body:** `{ "content": string, "project_id"?: string }`
- **Behaviour:**
  - Inserts log.
  - If `project_id` set: loads project, calls Anthropic to get new markdown `current_state`, updates `projects`. If Claude fails, still returns **200** with the created log plus `claude_error` string.
- **Response:** Log row `{ id, content, project_id, created_at }` optionally with `claude_error`.

### `DELETE /api/logs/:id`

- **Auth:** Required.
- **Response:** `{ ok: true }` or `404`.

### `GET /api/timesheet`

- **Auth:** Required.
- **Response:** Rows with `project_name` from join, newest `logged_at` first.

### `POST /api/timesheet`

- **Auth:** Required.
- **Body:** `{ "project_id": string, "duration_minutes"?: number, "duration"?: string, "notes"?: string }`
- **Duration:** Server accepts `duration` string via `parseDurationMinutes`: suffix `h`/`m`, decimal hours (e.g. `1.5`), or integer minutes.

### `GET /api/stable`

- **Auth:** Required.
- **Response:** `{ id, content, updated_at }` for `main` (or empty-shaped default if missing).

### `POST /api/stable`

- **Auth:** Required.
- **Body:** `{ "content": string }`
- **Effect:** Upsert `id = 'main'`.

### `GET /api/archive`

- **Auth:** Required.
- **Response:** All `weekly_archive` rows, newest `archived_at` first.

### `POST /api/archive`

- **Auth:** Required.
- **Effect:** Dumps all `logs` into JSON string, inserts `weekly_archive` row with current week label, **`DELETE FROM logs`**.
- **Response:** New archive row.

### `GET /api/export`

- **Auth:** Required.
- **Response:** `text/plain` markdown bundle:
  - Title: `Memory Machine v3 export`
  - Stable context
  - Current logs (with project name when joined)
  - All projects’ `current_state` (including archived, tagged with status)

---

## Claude integration (server-side)

**File:** `lib/claude.ts`

- **Model:** `claude-sonnet-4-20250514`
- **Endpoint:** `https://api.anthropic.com/v1/messages`
- **Headers:** `x-api-key`, `anthropic-version: 2023-06-01`

**System prompt (summary):** Act as a project state extractor; return **only** updated `current_state` as concise markdown (max ~300 words): phase, decisions, next action, dates/blockers.

**User payload:** Project name, current state (or “No state yet”), new log body; instruction to return updated state.

**Trigger:** Only when `POST /api/logs` includes a valid `project_id`.

---

## UI (MemoryMachineApp)

Single client component; design tokens: background `#f5f5f2`, text `#1a1a1a`, accent `#2d6a4f`, cards white with border `#e0e0dc`, 16px base, comfortable tap targets.

**Tabs:**

1. **Log** — Textarea, project select (active projects), submit → `POST /api/logs`. Log list grouped by day, expand/collapse, delete with confirm.
2. **Projects** — Active project cards; expand for full description, state, timesheet totals; add project; archive via `PATCH` status.
3. **Timesheet** — Project, duration input, notes; summary table (this week vs all time, Monday-based week); copy markdown table.
4. **Context** — Stable textarea, save, copy full export, archive & clear, list past archives expandable.
5. **Help** — Plain-text workflow + API key usage + button to call `POST /api/init`.

**Sign out:** Clears `sessionStorage` token keys.

---

## Operational workflow (for the human)

1. Configure env (Neon + password + optional API key + Anthropic).
2. Deploy or run `npm run dev`.
3. Open app → unlock → **Help → Run /api/init** once.
4. Routine: log sessions → optional weekly export in Context → refine stable text in Claude → paste back → archive week when ready.

---

## Relationship to v2

v2 used **local** persistence (browser / optional SQLite in older iterations). **v3 does not read v2 data.** Data lives in **Neon** only for v3. Migrating old content is manual or a separate script.

---

## Commands

```bash
npm install
npm run dev      # development
npm run build    # production build
npm run start    # production server (after build)
```

---

## Security notes (for implementers)

- Password and API key must stay **server-side** in env; never commit `.env` or `.env.local`.
- Storing the password in `sessionStorage` and sending it as Bearer is a deliberate simplicity trade-off for a single-user app; XSS would be high impact.
- Rate-limiting `POST /api/verify` is not implemented; consider if the app is public on the internet.

---

*Document generated to match the codebase as of Memory Machine v3. Update this file when behaviour or routes change.*
