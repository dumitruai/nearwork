# Nearwork

Nearwork is a mobile-first prototype for finding nearby frontline work in hospitality, retail, delivery, cleaning, and warehouses. Workers create a lightweight profile, set a travel radius, and swipe job cards to pass or express interest. Mutual interest opens a conversation; saved interests and matches persist between sessions.

Built against [the original product brief](product-brief.txt). **Android is the only native target**, with a browser preview. **Time spent: approximately 4 hours.**

Authentication, employer job posting/acceptance, persisted chat, realtime updates, maps, and optional generated replies extend the brief's worker-only core. They demonstrate a connected two-sided flow but increase setup and verification cost. Android builds and runs on an emulator; physical-device coverage remains unfinished. This is a prototype, not a production-ready hiring service.

## Contents

- [Run locally](#run-locally)
- [Verify the core flow](#verify-the-core-flow)
- [Product decisions and matching rules](#product-decisions-and-matching-rules)
- [Design decisions](#design-decisions)
- [Architecture and data](#architecture-and-data)
- [API reference](#api-reference)
- [Configuration](#configuration)


## Run locally

Requirements: Node.js 24, npm 11, and Docker Desktop running Linux containers. Versions are recorded in `.nvmrc`, `package.json`, and the lockfile. Run from the repository root:

```powershell
npm ci
Copy-Item apps/server/.env.example apps/server/.env
Copy-Item apps/mobile/.env.example apps/mobile/.env
docker compose up -d db redis
npm run db:migrate
npm run dev
```

Copy example files only on first setup; preserve existing configuration. On macOS/Linux, replace `Copy-Item` with `cp`.

| Service | Local address | Purpose |
| --- | --- | --- |
| Mobile preview | http://localhost:5173 | Application and signed-out landing |
| Backend | http://localhost:3000 | Authentication, `/api/v1`, and Socket.IO at `/api/socket-io/socket.io` |
| PostgreSQL | localhost:5432 | Database/user/password: `nearwork` |
| Redis | localhost:6379 | Events, presence, messaging quotas |

The combined command starts two app processes (mobile and backend) and stops them together. API and realtime share the backend's HTTP server, port, environment, and deployment. Email verification/recovery are not implemented. Create your own account to get started.

If port 5173 is occupied, start the mobile workspace with `npm run dev -w @nearwork/mobile -- --port 5174`, add that exact origin to server `TRUSTED_ORIGINS`, and run `npm run dev -w @nearwork/server` separately.

To exercise the production backend locally, run `npm run build -w @nearwork/server` followed by `npm run start -w @nearwork/server`. It serves both HTTP and WebSockets on port 3000 (`PORT`/`HOST` override the listener). Do not run it alongside the development backend on the same port.

To run everything in Docker instead:

```powershell
npm run docker:up
docker compose run --rm app npm run db:migrate
npm run docker:logs
npm run docker:down
```

Compose includes the app processes, PostgreSQL 17 and Redis 7. Source mounts support live updates; rebuild after dependency/configuration changes. Host servers and the app container cannot share the same ports. Ports bind to loopback; stopping Compose retains PostgreSQL's named volume. The Dockerfile is for development.

Migrations live in [apps/server/drizzle](apps/server/drizzle). After schema changes, run `npm run db:generate`, review SQL, then `npm run db:migrate`.

## Verify the core flow

### Worker flow

Run locally with `ENABLE_LOCATION_MOCKS=true` in `apps/server/.env` (the example default). Use a new worker account and select all five job categories.

1. **Location and radius:** allow device location. Before swiping, compare 1 km, 5 km, and 20 km radii. Wider radii should include farther jobs; every discovery card should stay within the selected radius. Distances are straight-line estimates.
2. **Change location:** choose a manual location well outside the current radius. Apply it and confirm that nearby jobs and distances change.
3. **Swipe:** swipe left on a job to pass and right on another to express interest. Each card should leave the deck; passed jobs should not appear in Saved. The labeled buttons should behave the same way.
4. **Simulated matches:** like a generated Café assistant, Delivery rider, or Warehouse assistant job; it should appear under **Saved → Matches**, with chat available. Like a generated Shop assistant or Office cleaner job; it should remain under **Saved → Interested**. No second account is needed.
5. **Persistence:** reload or sign out and back in. Interests and matches should remain, and decided jobs should not return to discovery.
6. **Edge cases:** deny location permission and confirm manual selection still works. Swipe through the remaining cards and check the empty state offers a way to adjust preferences.

Use a fresh worker account to repeat swipe checks: decisions cannot be undone.

### Employer flow

Use separate browser profiles or a private window to keep worker and employer accounts signed in together.

1. **Create an employer account:** complete the company profile and choose a workplace location.
2. **Post a job:** open **Jobs → Post a job**, enter the role, category, pay, hours, schedule, and description, then confirm the workplace. The listing should appear as **Active**.
3. **Receive interest:** on the worker account, select the job's category and a location within range. Refresh discovery, find the posted job, and swipe right. It should remain under **Saved → Interested** until accepted.
4. **Accept:** return to the employer's **Profile → Interests**, open the worker's details with **View**, and choose **Accept interest**. A chat should open, and the worker should appear under **Matches**.
5. **Chat:** open **Chats** on both accounts and exchange messages. Confirm they arrive without refreshing and remain after reloading.
6. **Pause and reactivate:** use **Jobs → Pause listing**. Confirm it disappears from fresh discovery for a worker who has not already swiped it. Reactivate it and confirm it returns; existing matches and chats should remain accessible throughout.

## Product decisions and matching rules

| Product decision | Why |
| --- | --- |
| Nearby frontline jobs | Help people find work close to home. |
| Lightweight profile, no CV or long application | Focus on roles where a detailed career and education history is unnecessary for initial contact. |
| Swipe right to express interest; mutual match opens chat | Make the first step simple and let both sides agree before talking. |
| Employer flow and chat | Demonstrate the complete journey from discovery to contact. |
| Device or manual location, adjustable radius | Search near home or another chosen area, including without location permission. |

### Improvement priorities

1. **Landing page and desktop web experience** — improve the first impression and usability beyond mobile.
2. **PostHog and monitoring** — identify drop-offs, confusing interactions, and failures to guide UX improvements.
3. **Suggestions and bug-report form** — give users a direct way to report problems and request improvements.

Keep the architecture simple; scale it when actual load requires it.

### Matching rules

| Rule | Why |
| --- | --- |
| Filter by category, availability overlap, and 1/5/10/20 km radius | Keep discovery relevant. Distance is straight-line; availability currently defaults to all slots in the UI. |
| Sort employer jobs by distance | Help workers find opportunities close to home. |
| One final pass or interest per job; no undo | Keep decisions simple and prevent duplicate actions. |
| Matches require employer acceptance | A conversation starts only after mutual interest. |
| Keep pending interests and matches separate | Make unanswered interest distinct from an open conversation. Saved jobs remain visible outside the radius or after becoming inactive. |

## Design decisions

| Choice | Why |
| --- | --- |
| Calm colors and simple surfaces | Keep attention on jobs and actions. |
| Bold headings, readable body text | Give the app character while keeping information easy to scan. |
| Role, pay, hours, and distance first | Help workers judge an opportunity quickly. |
| Swipes with labeled button alternatives | Make discovery quick without requiring gestures. |
| Reachable controls and bottom navigation | Support comfortable use on a phone. |
| Navigation tailored to workers and employers | Keep each role focused on its own tasks. |
| Clear feedback and accessible controls | Make actions understandable and easier to use. |
| Public landing page | Explain the product before asking users to sign up. |

## Architecture and data

| Location | Responsibility and rationale |
| --- | --- |
| [apps/mobile](apps/mobile) | Svelte 5, TypeScript, Vite, Capacitor 8: one UI for browser review/native packaging, with bundled assets. |
| [apps/server](apps/server) | SvelteKit 3 API, Better Auth, PostgreSQL/Drizzle, and Socket.IO: one backend for identity, decisions, conversations, and live events. |
| [apps/shared/domain.ts](apps/shared/domain.ts) | Shared categories, availability, and distance calculation imported directly by client/server. One small module avoids duplicate rules without a separate package, manifest, or workspace. |


### Data model and consistency

The authoritative schema is [schema.ts](apps/server/src/lib/server/db/schema.ts), with committed migrations.

| Entity | Purpose/invariant |
| --- | --- |
| Users, sessions, accounts, verification | Better Auth owns credentials/session data; user holds immutable profile type. |
| Employee/employer profiles | One-to-one role data; composite foreign keys/checks prevent wrong-role profiles; names stay on user. |
| Employee preferences | Radius and device/manual location source. Manual coordinates and label are saved; device coordinates are not persisted. |
| Jobs | Owner/workplace, category, pay in integer pennies, hours/schedule, active state. |
| Decisions | Unique employee/job pair and final pass/interested choice. |
| Matches | Unique employee/job pair referencing a decision; transaction requires interested state. |
| Conversations | One per match; participants derive from employee and job owner. |
| Messages | Text/sender/timestamps/read time; unique conversation/sender/client-message key. |


### Authentication and location

Use HttpOnly cookies and `credentials: 'include'`, with no localStorage session tokens. Server role/ownership checks and strict schemas govern protected actions. Trusted origins are explicit; HTTPS sessions use Secure/SameSite=None cookies. Native session persistence passed emulator force-stop checks against Vercel; physical-device coverage remains pending.

Device coordinates are supplied per discovery request and held in client memory. Android foreground resume can refresh already-authorized location. Fresh coordinates are sent to BigDataCloud for a place label; failure leaves “Current location” usable. Address searches use Photon; manual map selection remains available on failure. Manually selected coordinates and their label are saved in preferences; device coordinates are not. Location data leaves the device for search/geocoding. No background location history is implemented.

### Messaging

PostgreSQL persists before Redis Pub/Sub broadcasts to authenticated Socket.IO rooms. Redis stores transient presence/quotas, not chat history. Signed tokens expire after five minutes; conversation scope requires membership. Reconnect gets a fresh token and recovers history, merging by ID. Retry the same message with its original client UUID; changed text under that UUID conflicts.

Read receipts acknowledge displayed incoming messages in batches up to 100. Sent means persisted; Read means acknowledged. While connected, events update chats and unread counts. Reconnecting or resuming the app refreshes data to recover missed updates. Only while disconnected and visible, open chats poll every 10 seconds; chat lists and unread counts poll every 15 seconds. Redis limits sends to 60 attempts per user per minute.

Pub/Sub is not durable: commit-before-publish failures recover through retry/history refresh. Guaranteed delivery needs a transactional outbox.

## API reference

Routes live in [apps/server/src/routes/api](apps/server/src/routes/api); shared guards/validation in [server/api](apps/server/src/lib/server/api). Application success uses `{ "data": ... }`; errors use `{ "error": { "code": "...", "message": "...", "issues": [] } }`, with issues only for validation. Better Auth retains its own response format. JSON bodies require `Content-Type: application/json`. All application endpoints except health require a session.

| Method | Route | Purpose |
| --- | --- | --- |
| POST | `/api/auth/sign-up/email` | `{ name, email, password, profileType }`; type employee/employer |
| POST | `/api/auth/sign-in/email` | Email/password sign-in |
| POST | `/api/auth/sign-out` | Invalidate session |
| GET | `/api/auth/get-session` | Restore session |
| GET | `/api/v1/health` | Database readiness |
| GET | `/api/v1/me` | Own user/profile/preferences |
| PUT | `/api/v1/me/profile` | Role-specific profile |
| PUT | `/api/v1/me/preferences` | Radius and device/manual source; `point` coordinates and label are persisted for manual selection |
| GET, POST | `/api/v1/jobs` | Employee discovery / employer creation |
| GET, PATCH | `/api/v1/jobs/:id` | Detail / owner updates `{ isActive }` |
| POST | `/api/v1/jobs/:id/decision` | `{ decision: "pass" }` or `{ decision: "interested" }` |
| GET | `/api/v1/me/interests`, `/api/v1/me/matches` | Pending interests / mutual matches |
| GET | `/api/v1/employer/jobs`, `/api/v1/employer/interests` | Owned jobs / pending applicants |
| POST | `/api/v1/jobs/:id/interests/:employeeUserId/accept` | Create/reuse match and conversation |
| GET | `/api/v1/conversations`, `/api/v1/conversations/unread` | Conversation list / unread counts |
| GET, POST | `/api/v1/conversations/:id/messages` | History / `{ clientMessageId, body }` |
| POST | `/api/v1/conversations/:id/read` | `{ messageIds: [...] }`, up to 100 |
| GET | `/api/v1/realtime/token` | Optional `conversationId` for scoped token |

Payload bounds are defined in [validation.ts](apps/server/src/lib/server/api/validation.ts). Employee profiles require name/categories/availability, optional bio. Employer profiles require name/companyName/industry/workplaceLabel/latitude/longitude. Jobs require role/category, integer hourlyPayMinor, GBP currency, weekly min/max hours, availability, scheduleSummary, description, areaLabel, and coordinates. Ownership comes from the session.

Lists accept `limit` (1–100, default 30) and `offset`. Discovery returns `{ items, total }`; saved lists return arrays. Saved endpoints accept optional latitude/longitude together to add distance without changing visibility/order; invalid or partial coordinates return 400. Message history uses an opaque `before` cursor and returns chronological `items` plus `nextCursor`. Messages are trimmed, nonempty, and at most 4,000 characters.

Common errors: 400 invalid input, 401 unauthenticated, 403 role/origin denial, 404 missing/inaccessible resource, 409 incomplete setup/conflicting retry, 413 oversized body, 415 wrong content type, 429 rate limit. Inactive jobs reject new decisions/acceptances but permit retries of committed results.

## Configuration

Examples: [server environment](apps/server/.env.example), [mobile environment](apps/mobile/.env.example). Vite reads app-local files; the production launcher reads the server environment. API and realtime use the same configuration. Process environment can override file values.

| Variable | Where | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | API/scripts | PostgreSQL connection; use appropriate pooled runtime/direct migration connections when hosted |
| `TEST_DATABASE_URL` | Tests | Connection for isolated test databases; user needs `CREATEDB` |
| `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` | API | Session secret/public auth origin |
| `TRUSTED_ORIGINS` | API/realtime | Exact comma-separated web/native origins |
| `REDIS_URL` | API/realtime | TCP/TLS Redis with Pub/Sub, Lua, expiry; REST-only access is insufficient |
| `REALTIME_SECRET` | API/realtime | Independent shared signing secret, at least 32 characters |
| `PORT`, `HOST` | Production launcher | Default 3000 / `0.0.0.0`; development uses Vite's port |
| `ENABLE_APPLICANT_BOTS` | API | Generate applicants/enable automated conversation replies when true |
| `XAI_API_KEY`, `XAI_MODEL` | API only | Optional generated replies/model selection |
| `VITE_API_BASE_URL` | Mobile build | API origin and default realtime origin; default `http://localhost:3000`; same-origin web uses `/` |
| `VITE_REALTIME_URL` | Mobile build | Optional direct URL to the same backend when a hosted HTTP proxy cannot forward WebSocket upgrades |
| `VITE_GEOCODING_URL` | Mobile build | Photon-compatible endpoint; default `https://photon.komoot.io/api/` |

All `VITE_*` values are public and embedded at build time; never put secrets there. Example secrets/credentials are development-only. Hosted environments need independent secrets and isolated preview data. Compose reads app flags/AI overrides from the shell or root Compose environment, not automatically from `apps/server/.env`.

API and realtime run on the same backend. The client uses `VITE_REALTIME_URL` when set, otherwise `VITE_API_BASE_URL`, with the fixed socket path `/api/socket-io/socket.io`. Set the override when a hosted HTTP proxy cannot forward WebSocket upgrades. The local Vite proxy supports them.
