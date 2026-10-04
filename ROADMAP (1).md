# Real-Time Collaborative Workspace — Build Roadmap + GitHub Copilot Prompts

> Take-home: **Full-Stack Developer (Advanced)** · Real-time multi-tenant workspace with RBAC
> Budget: 20–30 h · Window: 10 days · This plan ≈ 30 h (frontend polish is the first thing to trim)

---

## 0. How to use this file

1. Create the repo, then save this file as `docs/ROADMAP.md`. Every prompt below references it (`#file:docs/ROADMAP.md`) so Copilot sees the locked decisions and the schema.
2. Use **Copilot Chat → Agent mode**. Paste **one phase prompt at a time**. Do not batch phases.
3. After each prompt, **run the "Verify" checklist yourself**. Do not trust "done" from the model. Only then commit using the suggested message (the PDF asks for an incremental commit history).
4. If Copilot deviates from a locked decision (Section 3), correct it immediately. Drift compounds.
5. Honest note: no process guarantees zero mistakes. This plan reduces risk by (a) pinning decisions up front, (b) giving a schema, (c) putting tests and verification gates in every phase. Pin dependency versions after install and do not upgrade majors mid-project.

---

## 1. Requirement traceability (PDF → solution → phase)

| # | PDF requirement | How it is met | Phase |
|---|---|---|---|
| F1 | Multi-tenant workspaces; invite by email; no cross-workspace leakage | `workspaceId` on every table; every query scoped by it; non-members get 404; `Invitation` table with hashed tokens | 2, 4, 5 |
| F2 | RBAC: Owner/Admin/Member/Viewer, enforced server-side on every mutating endpoint | Pure `permissions.ts` + `requireWorkspaceMember` + `requirePermission` middleware; table-driven test hitting every mutating route as Viewer | 4, 9 |
| F3 | Boards → ordered lists → ordered tasks; order correct under concurrent DnD | Fractional-indexing string positions, `COLLATE "C"`, row lock on list during move, unique `(listId, position)` | 2, 5 |
| F4 | Real-time sync ≤ ~1 s via WebSockets, no polling | Socket.IO rooms per board, events emitted **after commit**, Redis adapter, resync on reconnect | 7, 10b |
| F5 | Email/password auth, hashed, short-lived access token, refresh rotation, README explains storage/revocation | argon2id, 15-min JWT in memory, opaque refresh token (hashed in DB) in httpOnly cookie, rotation + reuse detection | 3 |
| F6 | Activity log per workspace (actor, action, timestamp), queryable | `ActivityLog` written in the same transaction as the mutation; cursor-paginated endpoint | 4, 6 |
| F7 | Full-text search + filter by assignee/label/status, paginated | Postgres `tsvector` expression GIN index + `websearch_to_tsquery`; page/pageSize (max 50) | 6 |
| F8 | Redis cache on an expensive read with sane invalidation | Workspace dashboard, cache-aside, 60 s TTL **plus** explicit `DEL` on mutation, fail-open | 8 |
| F9 | Background job via queue | BullMQ: invite emails + repeatable daily digest, retries/backoff | 8 |
| F10 | Validation, status codes, no leaked stack traces, no unhandled rejections | Zod everywhere, `AppError`, central error middleware, process-level handlers | 3, 9 |
| T1 | TypeScript on both sides | `strict: true` in both packages | 1 |
| T2 | React or Next.js | Next.js 15 (App Router) | 1, 10 |
| T3 | Node + Express or NestJS + WebSocket server | Express 5 + Socket.IO | 1, 7 |
| T4 | PostgreSQL + Prisma/TypeORM + versioned migrations in repo | Postgres 16 + Prisma 6, `prisma/migrations` committed | 2 |
| T5 | Redis for cache **and** queue | One Redis: ioredis (cache), BullMQ (queue), Socket.IO adapter | 7, 8 |
| T6 | Dockerfile per service + compose for full stack | `apps/api/Dockerfile`, `apps/web/Dockerfile`, root `docker-compose.yml` | 1 |
| T7 | GitHub Actions: lint + tests on every push | `.github/workflows/ci.yml` with Postgres + Redis services | 11 |
| T8 | Unit tests (authz, ordering) + integration tests (auth, task mutations) | Vitest + Supertest on a real test DB | 3–9 |
| T9 | Vercel (frontend) + Render (API + WS) + hosted DB/Redis | See Phase 12 | 12 |
| T10 | Public repo, incremental commits | One commit (or more) per phase | all |
| S1 | Submission: repo + CI badge, two live URLs, design note, **two test accounts in different roles**, Docker repro steps | Seed script creates Owner/Admin/Member/Viewer; README | 13 |

---

## 2. Final tech stack (every item maps to the PDF)

| Layer | Choice | Why / PDF link |
|---|---|---|
| Language | TypeScript (strict) | "TypeScript strongly preferred" |
| Backend | Node.js 20 LTS, **Express 5** | PDF allows Express or NestJS; Express keeps Socket.IO integration simple |
| Validation | Zod | "Consistent request validation" |
| ORM / DB | **Prisma 6** + **PostgreSQL 16** | "schema-first ORM … versioned migrations" |
| Cache / queue / pub-sub | **Redis 7**: `ioredis`, **BullMQ**, `@socket.io/redis-adapter` | "Redis used for both response caching and job queue" |
| Real-time | **Socket.IO 4** | PDF names Socket.IO explicitly |
| Auth | `argon2` (argon2id), `jsonwebtoken` (HS256), opaque refresh tokens | "bcrypt/argon2, rotation flow" |
| Security middleware | `helmet`, `cors`, `express-rate-limit`, `cookie-parser` | "Security" criterion |
| Logging | `pino` (+ `pino-http`) | No stack traces to client; structured logs |
| Email | `nodemailer`; **Mailpit** locally | Queue job needs a real side-effect |
| Ordering | `fractional-indexing` | Concurrency-safe ordering |
| Backend tests | **Vitest** + **Supertest** + `socket.io-client` | Unit + integration + realtime tests |
| Frontend | **Next.js 15** (App Router), React, Tailwind CSS | "React or Next.js" |
| Frontend data | TanStack Query, `socket.io-client`, `react-hook-form` + Zod | Server-state + live events |
| Drag and drop | `@dnd-kit/core` + `@dnd-kit/sortable` | Multi-container sortable lists |
| Containers | Docker, Docker Compose | Dockerfile per service + compose |
| CI | GitHub Actions | Lint + test per push |
| Hosting | Vercel (web), Render (API + WS), Neon Postgres, Redis (see Phase 12) | Exactly as the PDF lists |

**Repo shape:** two **independent packages** in one repo (`apps/api`, `apps/web`), each with its own `package.json` and lockfile. **No npm workspaces.** This avoids Docker-context, Vercel root-dir and CI path headaches.

---

## 3. Locked decisions (give these to Copilot, do not let it improvise)

1. **Tenancy:** `workspaceId` column on Workspace-owned tables (Board, List, Task, Label, ActivityLog, Invitation, Membership). Every service query includes `workspaceId` in its `where`. Resources fetched by ID alone are forbidden.
2. **Authorization chain on every `/api/workspaces/:workspaceId/*` route:** `authenticate` → `requireWorkspaceMember` (loads membership from DB by `(workspaceId, userId)`; **404** if not a member, so existence does not leak) → `requirePermission(action)` (**403** if role lacks it) → validate → service. Roles are **not** put in the JWT; they are read from DB per request so role changes take effect immediately.
3. **Permission matrix:** Section 5. Owner is the workspace creator and cannot be assigned, demoted or removed via API (ownership transfer is a documented limitation).
4. **Tokens:** access token = JWT HS256, 15 min, held **in memory** on the client (never localStorage). Refresh token = 32 random bytes (base64url), stored **SHA-256 hashed** in `RefreshToken`, delivered in an **httpOnly, Secure (prod), SameSite=Lax, Path=/api/auth** cookie, 7-day TTL. **Rotation on every refresh** (old token marked revoked). **Reuse detection:** presenting a revoked token revokes the entire `familyId`. Logout revokes the family.
5. **Cookie/CORS strategy (cross-domain Vercel↔Render):** the browser calls REST on the **Vercel origin** (`/api/*`), and Next.js **rewrites** proxy it to Render. This makes the refresh cookie first-party (no third-party-cookie breakage in Safari/Chrome). **WebSockets cannot go through Vercel**, so the browser connects to Render **directly** with the access token in the Socket.IO handshake `auth` (function form, so reconnects get a fresh token). Express needs `app.set('trust proxy', 1)`.
6. **Ordering:** `position` is a string from `fractional-indexing`, column collation forced to `"C"` (otherwise Postgres locale collation breaks base-62 ordering). Moves send `afterTaskId` (or `null` = top). Server, inside one transaction: lock the target list row `SELECT … FOR UPDATE` (lock both lists in ascending-id order when moving across lists), read the *current* neighbours, compute `generateKeyBetween(prev, next)`, update. If `afterTaskId` is no longer in the target list → **409 `STALE_POSITION`** and the client resyncs. Creation appends to the end under the same lock. `UNIQUE(listId, position)` / `UNIQUE(boardId, position)` is the safety net.
7. **Edit concurrency:** `Task.version` (int). `PATCH` requires the client's `version`; `UPDATE … WHERE id AND workspaceId AND version` affecting 0 rows → **409 `VERSION_CONFLICT`** with the latest task. Moves are serialized by the list lock (last-writer-wins on position) and still bump `version`.
8. **Task `status`** is an enum field (`TODO | IN_PROGRESS | DONE`) independent of the list (list = column, status = filterable attribute). Assignee must be a member of the same workspace (validated server-side). Labels are per-workspace, many-to-many.
9. **Search:** expression GIN index on `to_tsvector('english', coalesce(title,'') || ' ' || coalesce(description,''))`; query with `websearch_to_tsquery` (safe for raw user input); `Prisma.sql` parameterized raw query returns ordered IDs + total, then hydrate via Prisma. Offset pagination (so rank ordering works). Activity log uses **keyset (cursor) pagination** on `(createdAt DESC, id DESC)`.
10. **Events:** services call `eventPublisher.publish(event)` **after the DB transaction commits** (never inside). Socket gateway subscribes. Rooms: `user:{userId}` (auto-joined), `workspace:{id}`, `board:{id}`. Joining a board room re-checks membership + that the board belongs to the workspace. On member removal / role change the server force-leaves that user's sockets from workspace rooms. Server disconnects a socket when its access token expires (client reconnects with a fresh token). Client **refetches the board snapshot on every (re)connect** so missed events never leave it stale.
11. **Cache:** `GET /api/workspaces/:id/dashboard` (aggregates: tasks by status, by list, top assignees, overdue count, 7-day activity count). Key `cache:v1:ws:{id}:dashboard`, TTL 60 s, **explicit `DEL`** on any task/list/board/member mutation in that workspace. Response header `X-Cache: HIT | MISS | BYPASS`. **Fail-open:** Redis down → compute from DB, `BYPASS`, log a warning.
12. **Queue:** BullMQ queue `email`: (a) `send-invite-email` (enqueued on invite), (b) `daily-digest` repeatable job (cron `0 8 * * *` UTC) emailing Owners/Admins a 24 h activity summary; plus `POST /api/workspaces/:id/digest/send` (Owner/Admin) to trigger on demand for reviewers. Retries: 3 attempts, exponential backoff. Worker runs as separate entry (`src/worker.ts`, own compose service) **and** can be embedded in the API via `RUN_WORKER=true` (used on Render to avoid a paid background-worker service). If enqueue fails, the request still succeeds and the error is logged.
13. **Failure handling:** `/health` (liveness, always 200) and `/health/ready` (checks DB + Redis; 503 if DB down; Redis down = degraded but 200 with `redis:"down"`). Graceful shutdown on SIGTERM (close HTTP, sockets, queue, Prisma, Redis).
14. **Errors:** `AppError(status, code, message, details?)`; central handler returns `{ error: { code, message, details?, requestId } }`; never a stack in production responses. Status codes: 400 validation, 401 unauthenticated, 403 forbidden, 404 not found / not a member, 409 conflict, 422 not used, 429 rate limit, 500 generic.
15. **Invite delivery:** token emailed via queue. Because SMTP may not be configured in the deployed demo, when `EXPOSE_INVITE_LINKS=true` the create-invite response also returns the one-time accept link (documented trade-off, off by default).

---

## 4. API surface (all JSON, prefix `/api`)

```
POST   /auth/signup | /auth/login | /auth/refresh | /auth/logout      GET /auth/me
POST   /workspaces                         GET /workspaces            (mine)
GET    /workspaces/:wid                    PATCH /workspaces/:wid     DELETE /workspaces/:wid
GET    /workspaces/:wid/members            PATCH /workspaces/:wid/members/:userId   DELETE .../members/:userId
POST   /workspaces/:wid/invitations        GET .../invitations        DELETE .../invitations/:invId
POST   /invitations/accept                 (authenticated; body {token})
GET|POST   /workspaces/:wid/boards         GET|PATCH|DELETE /workspaces/:wid/boards/:bid   (GET = full snapshot)
POST   /workspaces/:wid/boards/:bid/lists  PATCH|DELETE /workspaces/:wid/lists/:lid   POST .../lists/:lid/move
POST   /workspaces/:wid/lists/:lid/tasks   PATCH|DELETE /workspaces/:wid/tasks/:tid   POST .../tasks/:tid/move
GET|POST   /workspaces/:wid/labels         PATCH|DELETE /workspaces/:wid/labels/:labelId
GET    /workspaces/:wid/tasks              (search + filters + pagination)
GET    /workspaces/:wid/activity           (cursor pagination)
GET    /workspaces/:wid/dashboard          (cached)
POST   /workspaces/:wid/digest/send
GET    /health      GET /health/ready      (no /api prefix)
```

---

## 5. Permission matrix

| Action | Owner | Admin | Member | Viewer |
|---|:-:|:-:|:-:|:-:|
| Read everything in workspace (boards, tasks, members, activity, dashboard, search) | ✅ | ✅ | ✅ | ✅ |
| Update workspace settings | ✅ | ✅ | ❌ | ❌ |
| Delete workspace | ✅ | ❌ | ❌ | ❌ |
| Invite / revoke invites | ✅ (any role except Owner) | ✅ (Member/Viewer only) | ❌ | ❌ |
| Remove member | ✅ (not self) | ✅ (Member/Viewer only) | ❌ | ❌ |
| Change role | ✅ (to Admin/Member/Viewer) | ✅ (between Member/Viewer only) | ❌ | ❌ |
| Leave workspace (remove self) | ❌ | ✅ | ✅ | ✅ |
| Create/update boards | ✅ | ✅ | ✅ | ❌ |
| Delete boards | ✅ | ✅ | ❌ | ❌ |
| Create/update/move/delete lists | ✅ | ✅ | ✅ | ❌ |
| Create/update/move/delete tasks | ✅ | ✅ | ✅ | ❌ |
| Manage labels | ✅ | ✅ | ✅ | ❌ |
| Trigger digest | ✅ | ✅ | ❌ | ❌ |

---

## 6. Target repo layout

```
.
├── .github/
│   ├── copilot-instructions.md
│   └── workflows/ci.yml
├── apps/
│   ├── api/
│   │   ├── prisma/ (schema.prisma, migrations/, seed.ts)
│   │   ├── src/
│   │   │   ├── config/ (env.ts)          ├── lib/ (prisma.ts, redis.ts, logger.ts, ordering.ts, errors.ts)
│   │   │   ├── middleware/               ├── modules/{auth,workspaces,members,invitations,boards,lists,tasks,labels,search,activity,dashboard}/
│   │   │   ├── realtime/ (gateway.ts, events.ts)   ├── queue/ (queues.ts, worker.ts, processors/, mailer.ts)
│   │   │   ├── app.ts   server.ts   worker.ts
│   │   ├── tests/{unit,integration,realtime}/
│   │   ├── Dockerfile  package.json  tsconfig.json  vitest.config.ts  eslint.config.js
│   └── web/ (Next.js app, Dockerfile, next.config.ts, ...)
├── docker/postgres/init.sql
├── docs/ (ROADMAP.md, DESIGN.md)
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## 7. Copilot project instructions (Phase 0 creates this file)

Content for `.github/copilot-instructions.md`:

````text
# Project rules for Copilot (read before every task)

Project: real-time multi-tenant collaborative workspace (Linear/Asana-lite). Full plan: docs/ROADMAP.md. Design: docs/DESIGN.md.

Stack (do not add or swap libraries without asking):
- API: Node 20, Express 5, TypeScript strict, Prisma 6 + PostgreSQL 16, ioredis, BullMQ, Socket.IO 4, Zod, argon2, jsonwebtoken, pino, helmet, Vitest + Supertest.
- Web: Next.js 15 App Router, React, Tailwind, TanStack Query, socket.io-client, dnd-kit, react-hook-form + Zod.

Hard rules:
1. TypeScript strict. No `any` (use `unknown` + narrowing). No non-null `!` without a comment.
2. Layering: routes -> controllers -> services -> Prisma. Controllers contain no business logic or Prisma calls.
3. TENANCY: every query on workspace-owned data MUST include workspaceId in `where`. Never fetch by id alone. Never trust a workspaceId from the body.
4. AUTHZ: authorization is enforced server-side via middleware chain authenticate -> requireWorkspaceMember -> requirePermission. Permission logic lives in a pure, unit-tested `permissions.ts`.
5. Validate ALL input (body, params, query) with Zod. Throw AppError for expected failures. Never return stack traces.
6. Raw SQL only via Prisma tagged templates / Prisma.sql (parameterized). Never string-concatenate SQL.
7. Mutations + their ActivityLog row happen in ONE transaction. Realtime events are published AFTER the transaction commits.
8. Redis failures must not break requests (cache fails open).
9. Use pino logger, never console.log. Never log passwords, tokens, or cookies.
10. Every feature ships with tests (unit for pure logic, integration for endpoints against the real test DB).
11. Small functions, explicit return types on exported functions, no dead code, no TODO without a linked note in docs/DESIGN.md.
12. If a task conflicts with docs/DESIGN.md or ROADMAP "Locked decisions", stop and ask instead of improvising.
13. After changes, run lint, typecheck, and tests, and report the actual output.
````

---

## 8. Phases

### Phase 0 — Design note + Copilot setup (≈1.5 h)

**Goal:** the PDF calls this "the single highest-leverage step". Produce `docs/DESIGN.md` and the Copilot rules file.

**Prompt**

````text
Context: #file:docs/ROADMAP.md (read Sections 1-7 and Appendix A fully).

Tasks (documentation only, write NO application code):
1. Create `.github/copilot-instructions.md` with the exact content of ROADMAP Section 7 (inside the text block).
2. Create `docs/DESIGN.md` containing:
   a. Goals and non-goals (one short paragraph each).
   b. A Mermaid `erDiagram` generated from the Prisma schema in ROADMAP Appendix A (all models, relations, key fields).
   c. Tenancy strategy (ROADMAP Locked decision 1).
   d. Authorization enforcement: a Mermaid flowchart of the middleware chain (authenticate -> requireWorkspaceMember -> requirePermission -> validate -> service) and the permission matrix from Section 5 as a table.
   e. Authentication: token storage and revocation strategy (Locked decisions 4 and 5), including the rotation + reuse-detection sequence as a Mermaid sequenceDiagram.
   f. Ordering and concurrency algorithm (Locked decisions 6 and 7), including why COLLATE "C" is required.
   g. Real-time event model: rooms, event names (task:created, task:updated, task:moved, task:deleted, list:created, list:updated, list:moved, list:deleted, board:updated, board:deleted, member:removed, member:role_changed), payload shape, publish-after-commit rule, resync on reconnect.
   h. Caching and queue choices with justification and invalidation rules (Locked decisions 11 and 12).
   i. Failure-mode table: DB down, Redis down, socket disconnect, worker down, stale client -> expected behaviour.
   j. Trade-offs and known limitations section (leave bullet placeholders to be filled as we build).
3. Do not invent decisions that contradict ROADMAP Section 3. If something is ambiguous, list it under "Open questions" instead of deciding.
````

**Verify**
- [ ] Mermaid diagrams render in VS Code preview / GitHub.
- [ ] ERD matches Appendix A (count the models).
- [ ] Nothing contradicts Section 3.

**Commit:** `docs: add design note and copilot instructions`

---

### Phase 1 — Scaffold, tooling, Docker Compose (≈1.5 h)

**Goal:** `docker compose up --build` brings up Postgres, Redis, Mailpit, API, Web with zero manual steps.

**Prompt**

````text
Context: #file:docs/ROADMAP.md #file:docs/DESIGN.md #file:.github/copilot-instructions.md

Scaffold the monorepo-style repo with TWO INDEPENDENT packages (no npm workspaces): `apps/api` and `apps/web`, each with its own package.json and package-lock.json.

apps/api:
- Node 20, TypeScript strict (`strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`), Express 5, build with `tsc` to `dist/`, dev with `tsx watch`.
- Dependencies: express, zod, pino, pino-http, helmet, cors, cookie-parser, express-rate-limit, ioredis, dotenv-free config (read process.env through a Zod-validated `src/config/env.ts` that fails fast with a clear message). Dev: typescript, tsx, vitest, supertest, @types/*, eslint + typescript-eslint (flat config), prettier.
- Scripts: dev, build, start, lint, typecheck, test, test:unit, test:integration.
- `src/app.ts` (builds the Express app without listening; sets `trust proxy` = 1, helmet, JSON body limit 100kb, cookie-parser, pino-http with request id), `src/server.ts` (listens, graceful shutdown on SIGTERM/SIGINT, `process.on('unhandledRejection'|'uncaughtException')` logging then exit).
- Endpoints now: `GET /health` (always 200 {status:"ok"}) and `GET /health/ready` (placeholder returning 200; will check DB/Redis later).
- `src/lib/errors.ts` with `AppError(status, code, message, details?)` and a central error middleware + 404 handler returning `{ error: { code, message, details?, requestId } }` with no stack traces in production.
- One trivial passing unit test and one Supertest test for /health so CI has something to run.
- vitest config: integration tests must run serially (`fileParallelism: false`), separate include patterns for unit vs integration.

apps/web:
- `create-next-app` equivalent: Next.js 15, TypeScript, App Router, Tailwind, ESLint, `src/` dir, `output: 'standalone'` in next.config.
- Scripts: dev, build, start, lint, typecheck. Home page just shows "Workspace" and the API health fetched through `/api/health`... NOTE: add a rewrite in next.config so `/api/:path*` proxies to `${process.env.API_URL}/api/:path*` AND `/health` proxies to `${process.env.API_URL}/health`.

Docker:
- `apps/api/Dockerfile`: multi-stage on `node:20-bookworm-slim` (install `openssl` and `ca-certificates` for Prisma; do NOT use alpine because of argon2/Prisma native binaries). Build stage: npm ci, prisma generate (skip gracefully if prisma folder does not exist yet), tsc. Runtime stage: production deps INCLUDING the `prisma` CLI (so `migrate deploy` can run), copy dist and prisma folder, run as non-root `node` user, `CMD ["sh","-c","npx prisma migrate deploy && node dist/server.js"]` (guard the migrate step if prisma folder is absent for now).
- `apps/web/Dockerfile`: multi-stage Next standalone build, non-root, accepts build ARG `NEXT_PUBLIC_SOCKET_URL` (NEXT_PUBLIC_* values are inlined at build time) and runtime env `API_URL`.
- `.dockerignore` for each app.
- `docker/postgres/init.sql` creating a second database `app_test` (mounted to /docker-entrypoint-initdb.d).
- Root `docker-compose.yml`: services postgres:16-alpine (db `app`, healthcheck pg_isready, named volume, init.sql mounted), redis:7-alpine (healthcheck redis-cli ping), mailpit (axllent/mailpit, ports 1025/8025), api (build ./apps/api, port 4000, env from `.env`, depends_on healthy postgres+redis), web (build ./apps/web, port 3000, build arg NEXT_PUBLIC_SOCKET_URL=http://localhost:4000, env API_URL=http://api:4000, depends_on api).
- Root `.env.example` listing every variable from ROADMAP Appendix B with safe dev defaults (JWT secret placeholder must be obviously fake and >= 32 chars). Root `.gitignore` (node_modules, dist, .next, .env, coverage).

Do not implement auth, Prisma models, or any feature yet.
Run and show real output of: `npm run lint && npm run typecheck && npm test` in both apps, then `docker compose up --build -d` and `curl localhost:4000/health`, `curl localhost:3000/api/health`.
````

**Verify**
- [ ] `cp .env.example .env && docker compose up --build` → all containers healthy.
- [ ] `curl localhost:4000/health` → `{"status":"ok"}`; `localhost:3000` loads; `localhost:8025` shows Mailpit.
- [ ] `npm run lint && npm run typecheck && npm test` pass in both apps.
- [ ] `.env` is git-ignored; `.env.example` committed.

**Commit:** `chore: scaffold api/web, dockerfiles and compose stack`

---

### Phase 2 — Database schema and migrations (≈1.5 h)

**Goal:** schema from Appendix A, versioned migrations, correct collation and FTS index.

**Prompt**

````text
Context: #file:docs/ROADMAP.md (Appendix A is the exact Prisma schema) #file:docs/DESIGN.md

In apps/api:
1. Install `prisma@6` (dev + also listed in dependencies so the production image can run `migrate deploy`) and `@prisma/client@6`. Pin exact versions in package.json. Add `fractional-indexing`.
2. Create `prisma/schema.prisma` EXACTLY as in ROADMAP Appendix A. Do not rename fields or models. If you believe something is wrong, stop and explain instead of changing it.
3. Generate the initial migration with `npx prisma migrate dev --name init` against the compose Postgres.
4. Create a SECOND migration with `npx prisma migrate dev --create-only --name collation_and_fts`, and put this SQL in it (then apply it):
   ALTER TABLE "List" ALTER COLUMN "position" TYPE TEXT COLLATE "C";
   ALTER TABLE "Task" ALTER COLUMN "position" TYPE TEXT COLLATE "C";
   CREATE INDEX "Task_fts_idx" ON "Task" USING GIN (to_tsvector('english', coalesce("title",'') || ' ' || coalesce("description",'')));
   (Position columns must use the "C" collation because fractional-indexing keys rely on byte ordering.)
5. Add `src/lib/prisma.ts` (singleton PrismaClient, query logging only in development) and `src/lib/ordering.ts` exporting `positionBetween(prev: string | null, next: string | null): string` wrapping `generateKeyBetween`.
6. Add npm scripts: `db:migrate` (migrate dev), `db:deploy` (migrate deploy), `db:reset`, `db:studio`, `db:seed` (placeholder), and a test helper `tests/helpers/db.ts` that connects to TEST_DATABASE_URL, runs `migrate deploy` once in a vitest globalSetup, and exposes `resetDb()` (TRUNCATE all tables RESTART IDENTITY CASCADE).
7. Unit tests for ordering.ts: generating 1,000 sequential "append" keys and 1,000 random-insert keys, then asserting that sorting by byte order (`<` on strings) equals insertion intent and all keys are unique.
8. Integration test: insert Tasks with mixed-case positions through Prisma and assert `orderBy position asc` returns byte-order (proves COLLATE "C" is active). Also assert the unique (listId, position) constraint rejects duplicates.
9. Update `/health/ready` to run `SELECT 1` and return 503 if it fails.

Show real output of: `npx prisma migrate status`, `npx prisma validate`, and the test run. Confirm that `npx prisma migrate dev` afterwards reports NO pending drift.
````

**Verify**
- [ ] `prisma/migrations/*` has exactly two folders and is committed.
- [ ] In `psql`: `\d "Task"` shows `position | text | collate C`; `\di` lists `Task_fts_idx`.
- [ ] Collation test and ordering tests pass.
- [ ] `migrate dev` shows no drift. If it tries to drop the GIN index, stop and fix before continuing.

**Commit:** `feat(db): prisma schema, migrations, collation + fts index, ordering util`

---

### Phase 3 — Authentication (≈3 h)

**Goal:** signup, login, refresh rotation with reuse detection, logout, `/me`, rate limiting.

**Prompt**

````text
Context: #file:docs/ROADMAP.md (Locked decisions 4, 5, 14) #file:docs/DESIGN.md #file:.github/copilot-instructions.md

Implement auth in apps/api under src/modules/auth. Libraries: argon2 (argon2id), jsonwebtoken, zod, express-rate-limit, cookie-parser (already installed).

Endpoints (prefix /api/auth):
- POST /signup {email, name, password}: email trimmed + lowercased; password min 8, max 128; unique email -> 409 EMAIL_TAKEN. Creates user, returns {user, accessToken} and sets refresh cookie.
- POST /login {email, password}: generic 401 INVALID_CREDENTIALS for unknown email AND wrong password (verify against a dummy hash when user is missing to equalize timing). Returns {user, accessToken} + refresh cookie.
- POST /refresh: reads cookie `rt`, hashes it (SHA-256), looks up RefreshToken. If missing/expired -> 401. If the token is already revoked -> revoke ALL tokens in that familyId and return 401 (reuse detection). Otherwise rotate: mark old revoked, create a new token in the SAME family, set new cookie, return {accessToken}. Rotation must happen in one transaction.
- POST /logout: revoke the presented token's family, clear cookie, return 204 (idempotent).
- GET /me (authenticated): returns the user and their workspace memberships {workspaceId, name, role}.

Details:
- Access token: JWT HS256, 15 min, claims {sub: userId}. Verify with explicit `algorithms: ['HS256']`. Secret from env (>= 32 chars, validated in env.ts). Do NOT put roles in the token.
- Refresh token: crypto.randomBytes(32).toString('base64url'); store only its SHA-256 hash; 7-day expiry; cookie options: httpOnly, secure when NODE_ENV=production, sameSite 'lax', path '/api/auth', maxAge 7 days.
- Origin check on /refresh and /logout: if an Origin header is present it must equal FRONTEND_URL, otherwise 403 (CSRF defence in depth).
- Rate limit /signup and /login (e.g. 10 requests / 15 min / IP) returning 429 with the standard error shape; keep limiter config injectable so tests can disable it.
- `authenticate` middleware in src/middleware/authenticate.ts: parses `Authorization: Bearer`, verifies JWT, loads req.user = {id}; 401 on any failure with code UNAUTHENTICATED. Extend Express Request typing properly (no `any`).
- Zod validation middleware `validate({body?, params?, query?})` in src/middleware/validate.ts returning 400 VALIDATION_ERROR with field details. Never include passwords or tokens in logs (configure pino redaction for authorization, cookie, password).
- Structure: auth.routes.ts, auth.controller.ts, auth.service.ts, token.service.ts, password.service.ts, auth.schemas.ts.

Tests (Vitest + Supertest, real test DB, resetDb between tests):
- Unit: token.service (hash is deterministic, tokens unique), password.service (hash != plaintext, verify true/false).
- Integration: signup ok / duplicate email 409 / weak password 400; login ok / wrong password 401 / unknown email 401 (same body); refresh rotates (new cookie differs, old one fails); REUSE of an old refresh token returns 401 AND invalidates the newest token of that family; logout revokes; expired refresh token rejected (manipulate expiresAt in DB); /me requires token; tampered/expired/alg=none JWT rejected; passwordHash never appears in any response.

Run lint, typecheck, and the full test suite and show the output.
````

**Verify**
- [ ] Manual: signup → `Set-Cookie: rt=…; HttpOnly; Path=/api/auth; SameSite=Lax`.
- [ ] Reuse-detection test passes (this is a top interview talking point).
- [ ] DB inspection: `RefreshToken.tokenHash` is a 64-char hex, never the raw token.
- [ ] No `passwordHash` in any response body; logs redact secrets.

**Commit:** `feat(auth): signup/login with argon2, refresh rotation + reuse detection`

---

### Phase 4 — Workspaces, members, invitations, RBAC (≈3 h)

**Goal:** the authorization backbone. Everything after this depends on it being right.

**Prompt**

````text
Context: #file:docs/ROADMAP.md (Locked decisions 1, 2, 3, 15; Section 4 API; Section 5 matrix) #file:docs/DESIGN.md #file:.github/copilot-instructions.md

Implement tenancy + RBAC in apps/api.

1. `src/modules/rbac/permissions.ts` — PURE module (no DB, no Express). Define `Role`, `Action` union (e.g. workspace.read, workspace.update, workspace.delete, member.invite, member.remove, member.changeRole, board.write, board.delete, list.write, task.write, label.write, digest.trigger) and:
   - `can(role, action): boolean` implementing ROADMAP Section 5 exactly.
   - `canInviteRole(actorRole, targetRole): boolean`
   - `canRemoveMember(actorRole, targetRole, isSelf): boolean`
   - `canChangeRole(actorRole, targetCurrentRole, newRole): boolean`
   Rules: OWNER can never be assigned, demoted, or removed via API; Admin can only act on MEMBER/VIEWER and only set MEMBER/VIEWER; Owner can set ADMIN/MEMBER/VIEWER; any non-owner may remove themselves.
2. Middleware (src/middleware):
   - `requireWorkspaceMember`: validates `:workspaceId` is a UUID, loads Membership by (workspaceId, req.user.id). Not a member (or workspace missing) -> 404 NOT_FOUND. Attaches `req.membership = {workspaceId, userId, role}`.
   - `requirePermission(action)`: 403 FORBIDDEN if `can(role, action)` is false.
3. Modules: workspaces, members, invitations.
   - POST /api/workspaces {name}: creates Workspace + Membership(OWNER) + activity log in ONE transaction. GET /api/workspaces lists the caller's workspaces with role. GET/PATCH/DELETE /api/workspaces/:workspaceId.
   - Members: GET list; PATCH /members/:userId {role}; DELETE /members/:userId. Apply canChangeRole/canRemoveMember. Removing/changing a member must happen with an ActivityLog row in the same transaction. After commit call `eventPublisher.publish(...)` (see 4).
   - Invitations: POST (email, role in ADMIN|MEMBER|VIEWER, validated with canInviteRole) creates Invitation with a random 32-byte token (store SHA-256 hash, expires in 7 days), 409 if the email is already a member or has a pending invite. Returns the invitation (and the raw accept link only when env EXPOSE_INVITE_LINKS=true). GET lists pending invitations; DELETE revokes (sets revokedAt). POST /api/invitations/accept {token} (authenticated): token hash lookup; reject expired/revoked/already-accepted; the authenticated user's email must equal the invitation email (case-insensitive) else 403; create Membership; set acceptedAt; log activity. All in one transaction; idempotent safeguards for double-accept (409).
   - Create an `InviteNotifier` interface with a no-op implementation now (the queue implementation arrives in Phase 8) and call it after commit.
4. `src/lib/events.ts`: define a typed `DomainEvent` union and `eventPublisher` (in-process EventEmitter wrapper with `publish` and `subscribe`). No sockets yet.
5. `src/modules/activity/activity.service.ts` with `record(tx, {workspaceId, actorId, action, entityType, entityId?, metadata?})` using the passed Prisma transaction client. Actions used now: workspace.created, member.invited, member.joined, member.removed, member.role_changed, invitation.revoked.

Tests:
- Unit (table-driven) for every function in permissions.ts across all 4 roles, including edge cases: admin cannot promote to ADMIN, admin cannot touch OWNER, nobody can assign OWNER, owner cannot remove self, member can leave.
- Integration: create workspace -> caller is OWNER; TENANT ISOLATION (user B gets 404 on every GET/PATCH/DELETE of workspace A including members and invitations); Viewer/Member get 403 on invite/remove/changeRole; Admin limits; invite -> accept happy path; accept with wrong email 403; expired/revoked token rejected; activity rows exist for each mutation.

Show lint/typecheck/test output.
````

**Verify**
- [ ] Unit tests cover the full matrix; integration proves user B → 404 for workspace A.
- [ ] Try in the REST client: Admin changing another Admin's role → 403.
- [ ] Every mutating route in this phase has `requirePermission` or an explicit reason it does not (`POST /workspaces`, `POST /invitations/accept`).

**Commit:** `feat(rbac): workspaces, memberships, invitations and permission middleware`

---

### Phase 5 — Boards, lists, tasks, labels, ordering + concurrency (≈3.5 h)

**Goal:** the core domain with correct concurrent ordering. This is 45% of the score together with Phases 4 and 7.

**Prompt**

````text
Context: #file:docs/ROADMAP.md (Locked decisions 1, 2, 6, 7, 8, 10) #file:docs/DESIGN.md #file:.github/copilot-instructions.md

Implement boards, lists, tasks, labels in apps/api src/modules/{boards,lists,tasks,labels}. Follow the layering rule. Every route is under /api/workspaces/:workspaceId with the chain authenticate -> requireWorkspaceMember -> requirePermission(...) -> validate.

Rules:
- Every service query includes workspaceId in `where`. When a list/board/task id is supplied, verify it belongs to the workspaceId from the route (404 otherwise). A task's listId/boardId/workspaceId must always be consistent.
- Boards: create/list/get/update/delete. `GET boards/:boardId` returns a SNAPSHOT {board, lists:[{...list, tasks:[...]}], labels, members} with lists ordered by position and tasks ordered by position (position columns use COLLATE "C"), tasks include assignee {id,name} and label ids.
- Lists: create (append to end), rename, move (`POST /lists/:lid/move {afterListId: string|null}`), delete.
- Tasks: create in a list (append to end), update (title, description, status, assigneeId, dueDate, labelIds) requiring `version` -> optimistic concurrency: `updateMany where {id, workspaceId, version}`; 0 rows -> 409 VERSION_CONFLICT including the latest task; on success `version` + 1. Assignee must be a member of the same workspace (400 otherwise). LabelIds must belong to the same workspace.
- Move: `POST /tasks/:tid/move {toListId, afterTaskId: string|null}`. In ONE transaction: (1) lock the target list row with `SELECT id FROM "List" WHERE id = $1 AND "workspaceId" = $2 FOR UPDATE` via `tx.$queryRaw` tagged template; when the source list differs, lock BOTH lists in ascending id order to avoid deadlocks; (2) read the CURRENT neighbours: prev = the task with id afterTaskId (must exist in the target list, else 409 STALE_POSITION), next = the first task in the target list with position > prev.position (or the first task of the list when afterTaskId is null); (3) `positionBetween(prev?.position ?? null, next?.position ?? null)`; (4) update listId, position, version+1; (5) write the activity log row. Same locking approach for list moves within a board, for task creation (append) and list creation (append).
- Deleting tasks/lists/boards cascades per schema and logs activity (include task title in metadata since the row disappears).
- All mutations record ActivityLog in the same transaction (task.created, task.updated, task.moved with from/to list ids, task.deleted, list.created/updated/moved/deleted, board.created/updated/deleted, label.* ) and, AFTER the transaction commits, call eventPublisher.publish with the DomainEvent (task:created, task:updated, task:moved, task:deleted, list:*, board:*). Event payload: {type, workspaceId, boardId, actorId, entity, ts}. Never publish inside the transaction callback.
- Permissions: use the actions in permissions.ts (board.write, board.delete, list.write, task.write, label.write); reads need workspace.read.
- Zod schemas for every route. Reasonable limits (title 1..200, description <= 10_000, labels per task <= 20).

Tests (real test DB):
- Unit: any pure helper you add.
- Integration: CRUD per resource; tenant isolation (user from workspace B cannot read/modify tasks/lists/boards/labels of workspace A, even with valid ids -> 404; also a task id from workspace A used under workspace B's URL -> 404); Viewer gets 403 on every mutating endpoint here; assignee from another workspace rejected.
- CONCURRENCY (critical): (a) fire 20 `Promise.all` moves of different tasks into the same list with afterTaskId=null -> all succeed, final positions are all unique and sorted consistently, no 500s; (b) two simultaneous PATCHes with the same `version` -> exactly one 200 and one 409; (c) moving a task after a neighbour that was just deleted -> 409 STALE_POSITION; (d) cross-list concurrent moves A->B and B->A do not deadlock (finish within the test timeout).
- Snapshot ordering test: after random moves, GET snapshot order equals expected order.

Show lint/typecheck/test output, run the concurrency tests 5 times in a row (they must be stable) and show the result.
````

**Verify**
- [ ] Concurrency tests pass **5 times in a row**.
- [ ] Grep the code: no `findUnique({ where: { id } })` on workspace-owned tables without `workspaceId` (use `findFirst` with both, or `updateMany`/`deleteMany` with both).
- [ ] No event is published inside `$transaction(...)` callbacks.

**Commit:** `feat(core): boards, lists, tasks, labels with concurrent-safe ordering`

---

### Phase 6 — Activity log query, search, filtering, pagination (≈2 h)

**Prompt**

````text
Context: #file:docs/ROADMAP.md (Locked decision 9) #file:docs/DESIGN.md

Implement in apps/api:

1. GET /api/workspaces/:workspaceId/activity?limit=&cursor=&actorId=&action=&entityType= (any member may read). Keyset pagination ordered by (createdAt DESC, id DESC); `cursor` is an opaque base64url of {createdAt, id}; default limit 25, max 100. Response {items:[{id, action, entityType, entityId, metadata, createdAt, actor:{id,name}|null}], nextCursor|null}. Invalid cursor -> 400.
2. GET /api/workspaces/:workspaceId/tasks?q=&assigneeId=&labelId=&status=&boardId=&page=&pageSize= (any member). page default 1, pageSize default 20, max 50. Behaviour:
   - Build ONE parameterized query with `Prisma.sql` fragments (never string concatenation) that always has `"workspaceId" = ${workspaceId}`.
   - If `q` is present: `to_tsvector('english', coalesce("title",'') || ' ' || coalesce("description",'')) @@ websearch_to_tsquery('english', ${q})` (EXACT same expression as the GIN index so it is used) and order by `ts_rank` DESC then id; else order by `"updatedAt" DESC, id`.
   - Filters: assigneeId (also accept `unassigned`), status enum, labelId via EXISTS on "TaskLabel", boardId.
   - Return {items, page, pageSize, total, totalPages}. Compute `total` with a COUNT query using the same WHERE fragments. Fetch ids from raw SQL, then hydrate with Prisma (include assignee, labels) and re-order to match the id order.
   - Validate all filter ids as UUIDs; q max length 200; empty q ignored.
3. Make sure every earlier mutation already writes ActivityLog; add any missing ones (task.*, list.*, board.*, label.*, member.*, invitation.*).

Tests:
- Activity: pagination across pages has no duplicates/skips (create 60 events with equal createdAt values to test the tiebreaker), filters work, tenant isolation (workspace B cannot read A's log).
- Search: matches title and description, stemming works ("deploying" finds "deploy"), ranking puts title matches first, filters combine (assignee + label + status), pagination totals correct, SQL-injection attempt in `q` (e.g. `'; DROP TABLE "Task"; --`) returns normally and the table still exists, results never include another workspace's tasks.
- Run `EXPLAIN` in a test or script on a seeded 5k-task workspace and confirm the GIN index is used (document the result in docs/DESIGN.md).
````

**Verify**
- [ ] Injection test passes; cross-tenant search test returns 0 rows from the other workspace.
- [ ] `EXPLAIN` shows `Bitmap Index Scan on "Task_fts_idx"` on a large set. For tiny tables Postgres may choose a seq scan, which is normal.

**Commit:** `feat(search): activity log cursor pagination and full-text task search`

---

### Phase 7 — Real-time layer with Socket.IO (≈2.5 h)

**Prompt**

````text
Context: #file:docs/ROADMAP.md (Locked decisions 5, 10) #file:docs/DESIGN.md #file:.github/copilot-instructions.md

Add the WebSocket server to apps/api. Install `socket.io@4`, `@socket.io/redis-adapter`, and `socket.io-client` (dev, for tests).

1. `src/realtime/gateway.ts`: attach Socket.IO to the SAME http.Server created in server.ts (path default /socket.io). CORS: origin = FRONTEND_URL only, credentials true.
2. Auth middleware on handshake: read `socket.handshake.auth.token`, verify the JWT (same verifier as REST, algorithms ['HS256']); reject with an Error('UNAUTHENTICATED') otherwise. On connect: join room `user:{userId}`. Schedule `socket.disconnect(true)` at the token's `exp` (clear timer on disconnect) so expired sessions cannot linger; the client reconnects with a fresh token.
3. Client -> server events (all with ack callbacks returning {ok:true} or {ok:false, code}):
   - `board:join {workspaceId, boardId}`: validate payload with Zod; verify Membership (any role incl. VIEWER) AND that the board belongs to the workspace; then join `board:{boardId}` and `workspace:{workspaceId}`. Otherwise ack {ok:false, code:'NOT_FOUND'} and do NOT join.
   - `board:leave {boardId}`.
   Clients cannot emit domain mutations over the socket: all writes stay on REST so RBAC is enforced in one place.
4. Subscribe to `eventPublisher` (from Phase 4/5) and emit each DomainEvent to `board:{boardId}` (task/list events) or `workspace:{workspaceId}` (board/member events). Event names exactly: task:created, task:updated, task:moved, task:deleted, list:created, list:updated, list:moved, list:deleted, board:updated, board:deleted, member:role_changed, member:removed. Payloads include the full updated entity (with `version` and `position`) plus `actorId`.
5. When a member is removed or their role changes: emit `member:removed` / `member:role_changed` to `user:{userId}`, and for removal force-leave all of that user's sockets from `workspace:{id}` and all `board:*` rooms of that workspace (`io.in('user:{userId}').fetchSockets()`, then `socketsLeave`). Add the needed board->workspace tracking (e.g. socket.data.rooms map).
6. Redis adapter: create two ioredis connections (pub/sub) and use `createAdapter`. If Redis is unreachable at startup, log a warning and fall back to the default in-memory adapter instead of crashing.
7. Graceful shutdown: close io before the HTTP server.

Tests (tests/realtime, real http server on an ephemeral port + two socket.io-client clients logged in as two different users in the same workspace, plus a third user from another workspace):
- Client A and B join the board; A creates, edits, moves, deletes a task via REST -> B receives each event with correct payload in < 1000 ms.
- Non-member joining a board gets {ok:false} and receives NO events.
- Invalid token -> connection refused.
- Removing user B from the workspace -> B stops receiving events immediately and gets `member:removed`.
- A Viewer can join and receive events.
- Events are NOT emitted for a REST call that fails/rolls back (e.g. 409).

Show real test output.
````

**Verify**
- [ ] Open two browser tabs with Socket.IO client script or tests; latency visibly under 1 s.
- [ ] Removed user cannot receive subsequent events.
- [ ] Killing Redis does not crash the API (adapter falls back, warning logged).

**Commit:** `feat(realtime): socket.io gateway with rooms, redis adapter, authz on join`

---

### Phase 8 — Redis caching + BullMQ background jobs (≈2 h)

**Prompt**

````text
Context: #file:docs/ROADMAP.md (Locked decisions 11, 12, 13) #file:docs/DESIGN.md

Implement in apps/api. Install `bullmq` and `nodemailer` (+ types). Reuse one ioredis config helper in src/lib/redis.ts. IMPORTANT: BullMQ connections must be created with `maxRetriesPerRequest: null`; the cache client should use short timeouts and not block requests when Redis is down.

A) Caching — dashboard
- GET /api/workspaces/:workspaceId/dashboard (any member). Compute with a few aggregate queries: tasks by status, tasks per list (per board), top 5 assignees by open tasks, overdue count (dueDate < now and status != DONE), activity count last 7 days, member count.
- Cache-aside via `src/lib/cache.ts` (`getOrSet(key, ttlSeconds, loader)`): key `cache:v1:ws:{workspaceId}:dashboard`, TTL 60 s. Set response header `X-Cache: HIT|MISS|BYPASS`.
- Invalidation: `invalidateDashboard(workspaceId)` (DEL) called AFTER commit for every task/list/board/member mutation (do it centrally by subscribing to eventPublisher so it cannot be forgotten).
- Fail-open: any Redis error -> log warn, compute from DB, header BYPASS. Add a small single-flight guard per key (in-process promise map) to avoid a thundering herd.
- Keys are always namespaced by workspaceId so tenants never share cache entries.

B) Queue — emails
- `src/queue/queues.ts`: queue `email` with default job options {attempts: 3, backoff exponential 5s, removeOnComplete: {count: 1000}, removeOnFail: {count: 5000}}.
- `src/queue/mailer.ts`: nodemailer transport from SMTP_URL (Mailpit in compose: smtp://mailpit:1025). If SMTP_URL is unset use `jsonTransport` and log the message (so deployed demo never crashes).
- Processors: `send-invite-email` (payload: invitationId and the raw token is NOT stored in the job; instead include the already-built accept link in the job data and keep jobs short-lived with removeOnComplete) and `daily-digest` (for each workspace, email Owners/Admins a 24 h activity summary; process workspaces in batches).
- Replace the no-op InviteNotifier from Phase 4 with a queue-backed implementation: enqueue after commit; if enqueue throws, log and continue (the invite request still succeeds).
- Register the repeatable daily digest (cron `0 8 * * *`, UTC) using the repeatable/job-scheduler API of the INSTALLED BullMQ version (check its docs; do not guess), idempotently at worker start.
- `POST /api/workspaces/:workspaceId/digest/send` (Owner/Admin only) enqueues a digest for that workspace and returns 202 with the job id.
- Worker entrypoints: `src/worker.ts` (standalone process, graceful shutdown) AND support `RUN_WORKER=true` to start the same worker inside server.ts. Add a `worker` service to docker-compose (same image, `command: node dist/worker.js`) with RUN_WORKER=false on the api service.

Tests:
- Cache: first call MISS, second HIT; creating/moving/deleting a task or changing membership -> next call MISS with updated numbers; two workspaces have independent entries; with Redis client stubbed to throw, endpoint still returns 200 with BYPASS.
- Queue: creating an invitation enqueues exactly one `send-invite-email` job and the HTTP response does not wait for sending (assert response time vs. a deliberately slow mailer stub); processor unit test with a fake mailer; failed job retries (attempts) behaviour with a throwing mailer; digest endpoint returns 202 and enqueues; Viewer/Member get 403.
- Manual check documented: invite via API -> email visible in Mailpit at localhost:8025.
````

**Verify**
- [ ] `X-Cache` flips MISS → HIT → MISS after a task change.
- [ ] Invite email shows up in Mailpit via the worker.
- [ ] `docker compose stop redis` → dashboard still returns 200 (`BYPASS`), invites still return 201.

**Commit:** `feat(infra): redis dashboard cache and bullmq email/digest jobs`

---

### Phase 9 — Hardening, validation audit, failure handling (≈1 h)

**Prompt**

````text
Context: #file:docs/ROADMAP.md (Locked decisions 2, 13, 14) #file:.github/copilot-instructions.md

Audit and harden apps/api. Do not add features.

1. Route audit: write `tests/integration/rbac-matrix.test.ts` that enumerates EVERY mutating endpoint (POST/PATCH/DELETE under /api/workspaces/:wid/*) in a table with the minimum role allowed, then automatically asserts: unauthenticated -> 401; non-member -> 404; VIEWER -> 403 for all mutating routes; roles below the minimum -> 403; minimum role passes authorization (response is not 401/403/404 due to authz). Add a guard test that walks the Express router stack and FAILS if a mutating route under /api/workspaces/:workspaceId is not in the table (so new routes cannot be added unprotected).
2. Security headers/config: helmet defaults, CORS allowlist from FRONTEND_URL only (credentials true), body limit 100kb, disable `x-powered-by`, rate limiting on auth (already) plus a generous global limiter keyed by user id or IP, `trust proxy` verified.
3. Validation: confirm every route validates params, query and body; reject unknown keys with Zod `.strict()` on bodies; UUID validation on all id params; malformed JSON -> 400 (not 500).
4. Error handling: verify that unknown errors become 500 `INTERNAL_ERROR` with requestId and no stack in production; Prisma known errors mapped (P2002 -> 409, P2025 -> 404) in the central handler; test with NODE_ENV=production that no response contains "at " stack lines.
5. Process safety: `unhandledRejection` and `uncaughtException` log and trigger graceful shutdown; confirm no floating promises (enable `@typescript-eslint/no-floating-promises` and `no-misused-promises`, fix all violations).
6. Readiness: `/health/ready` returns 503 if DB fails; if Redis fails returns 200 with {redis:"down"}; test both.
7. Run `npm audit --omit=dev` and report high/critical findings.

Report every change made and show the full lint/typecheck/test output.
````

**Verify**
- [ ] The router-walk guard test genuinely fails if you temporarily add an unprotected route.
- [ ] Production-mode 500 response has no stack.
- [ ] `no-floating-promises` is enabled and clean.

**Commit:** `chore(api): rbac matrix test, security hardening, error-handling audit`

---

### Phase 10 — Frontend (≈5 h, in three sub-phases)

#### 10a — Foundation: auth, API client, workspace shell (≈1.5 h)

**Prompt**

````text
Context: #file:docs/ROADMAP.md (Locked decisions 4, 5) #file:docs/DESIGN.md #file:.github/copilot-instructions.md

In apps/web (Next.js 15 App Router, Tailwind, TypeScript strict) install: @tanstack/react-query, react-hook-form, @hookform/resolvers, zod, socket.io-client, @dnd-kit/core, @dnd-kit/sortable, @dnd-kit/utilities.

Build:
1. `src/lib/api.ts`: fetch wrapper using RELATIVE URLs (`/api/...`, proxied by the Next rewrite) with `credentials: 'include'`. The access token lives ONLY in a module-level variable / React context (NEVER localStorage/sessionStorage). On 401, call `/api/auth/refresh` ONCE (single-flight: concurrent 401s share one refresh promise), retry the original request, and if refresh fails clear auth state and redirect to /login. Parse the standard error shape `{error:{code,message,details}}` into a typed ApiError.
2. `AuthProvider`: on app load call `/api/auth/refresh` to restore the session (cookie-based), then `/api/auth/me`. Expose user, memberships, login, signup, logout, getAccessToken.
3. Pages: `/login`, `/signup` (react-hook-form + Zod, show server field errors), `/` (redirect to the first workspace or an onboarding screen), `/w/[workspaceId]` layout with sidebar (workspace switcher, boards list, links to Dashboard, Search, Activity, Members), "Create workspace" dialog, and `/invite/[token]` (requires login, calls POST /api/invitations/accept, then redirects).
4. A `useRole(workspaceId)` hook returning the caller's role and a `can(action)` helper that MIRRORS the server matrix for hiding/disabling UI only (add a comment that the server is the authority).
5. Global error boundary, loading states, empty states, and a visible toast system. Add a backend warm-up: on app load, fire `GET /health` and show a "Waking up server…" banner if it takes more than 2 s (Render free instances cold-start).
6. Escape/render all user content as plain text (no dangerouslySetInnerHTML anywhere).
7. next.config rewrites already proxy /api and /health to API_URL; verify they work in docker compose.

Show `npm run lint && npm run typecheck && npm run build` output.
````

**Verify**
- [ ] Refresh the page while logged in → session restored via cookie; no token in `localStorage`.
- [ ] Two parallel 401s trigger **one** refresh call (Network tab).
- [ ] `grep -r dangerouslySetInnerHTML apps/web/src` → no results.

**Commit:** `feat(web): auth flow, api client with refresh, workspace shell`

#### 10b — Board view: drag-and-drop + real-time (≈2 h)

**Prompt**

````text
Context: #file:docs/ROADMAP.md (Locked decisions 5, 6, 7, 10) #file:docs/DESIGN.md

Build `/w/[workspaceId]/boards/[boardId]` in apps/web.

1. Data: TanStack Query fetches the board snapshot (GET /api/workspaces/:wid/boards/:bid). Keep it normalized in the query cache.
2. Socket: `useBoardSocket(workspaceId, boardId)` — `io(NEXT_PUBLIC_SOCKET_URL, { auth: (cb) => cb({ token: getAccessToken() }), transports: ['websocket'] })` (connect DIRECTLY to the Render/API origin; Vercel cannot proxy WebSockets). On `connect` (including every reconnect): emit `board:join` with ack, then REFETCH the snapshot (so missed events cannot leave the UI stale). Handle `connect_error` UNAUTHENTICATED by refreshing the access token then reconnecting. Show a small "Live / Reconnecting" indicator.
3. Apply incoming events to the query cache idempotently: ignore an event whose entity `version` is <= the cached version; task:moved updates listId + position and re-sorts; task:deleted removes; list events likewise; `member:removed` for the current user -> leave the workspace UI with a toast; `member:role_changed` for the current user -> update role in context.
4. Drag-and-drop with @dnd-kit (sortable lists horizontally, sortable tasks vertically and across lists). On drop compute `afterTaskId` (the task immediately above the drop position in the target list, or null for top) and call POST /tasks/:id/move. Use OPTIMISTIC update with rollback: on 409 STALE_POSITION or any error, roll back and refetch the snapshot with a toast. Same for list moves (afterListId).
5. Task create (inline in a list), task detail drawer/modal (title, description, status, assignee, due date, labels). Saving sends the current `version`; on 409 VERSION_CONFLICT show a conflict banner with the latest server values and let the user "Keep mine (re-apply on top of latest)" or "Use theirs".
6. VIEWER role: render the board read-only (no drag handles, no create/edit buttons) using `useRole`, but never rely on this for security.
7. Keep components small, typed, and accessible (keyboard sensor enabled in dnd-kit).

Manual verification script to include in docs/DESIGN.md (testing section): two browsers, two users (Owner + Member), same board — create/edit/move/delete a task in one and watch the other update in about a second; move the same task in both at once and confirm both screens converge to the same order after the events settle; kill the API for 10 s and confirm it reconnects and resyncs.
````

**Verify**
- [ ] Two different browsers (not two tabs of the same login) converge on the same order after simultaneous drags.
- [ ] Viewer account has no editing affordances, and direct API calls as Viewer still return 403.
- [ ] Network tab: socket is `websocket` transport, no polling requests.

**Commit:** `feat(web): realtime board with dnd, optimistic moves and conflict handling`

#### 10c — Members, activity, search, dashboard (≈1.5 h)

**Prompt**

````text
Context: #file:docs/ROADMAP.md #file:docs/DESIGN.md

Add to apps/web under `/w/[workspaceId]`:
1. `/members`: member table with role badges; invite form (email + role, only roles allowed by the matrix); pending invitations list with revoke; change-role select and remove button shown only when permitted by `can(...)`; show server error messages (403/409) in toasts. If the API returns an accept link (EXPOSE_INVITE_LINKS), show it with a copy button.
2. `/activity`: infinite scroll with the cursor API, human-readable messages ("Maya moved 'Fix login' from To Do to Doing"), filters by actor and action, relative timestamps.
3. `/search`: debounced search box (300 ms) + filters (assignee incl. unassigned, label, status, board) + paginated results (page/pageSize from the API) with total count, URL-synced query params, loading and empty states; clicking a result opens the board with the task drawer.
4. `/dashboard`: render the dashboard endpoint (cards + simple bar charts using plain CSS/SVG, no new chart library). Show a small "cached" hint from the `X-Cache` header only in development mode.
5. Live updates: when board events arrive, invalidate the dashboard and activity queries (the workspace room events are already received on the board page; also join the workspace room from the shell with a lightweight listener).

Run lint, typecheck, build. Add 3-5 React component tests (Vitest/Testing Library is fine; add only if it doesn't bloat setup) for `can()` helper and the members table permission gating.
````

**Verify**
- [ ] Member-level user cannot see invite or remove controls.
- [ ] Search is paginated; changing filters resets to page 1.
- [ ] `npm run build` is clean.

**Commit:** `feat(web): members, activity feed, search and dashboard pages`

---

### Phase 11 — CI with GitHub Actions (≈0.75 h)

**Prompt**

````text
Context: #file:docs/ROADMAP.md #file:apps/api/package.json #file:apps/web/package.json

Create `.github/workflows/ci.yml`:
- Triggers: `push` (all branches) and `pull_request`. Add `concurrency` to cancel superseded runs.
- Job `api` (ubuntu-latest, working-directory apps/api): services `postgres:16` (POSTGRES_PASSWORD, POSTGRES_DB=app_test, health-cmd pg_isready with retries) and `redis:7` (health-cmd redis-cli ping). Steps: actions/checkout, actions/setup-node with node-version 20 and npm cache keyed on apps/api/package-lock.json, `npm ci`, `npx prisma generate`, `npx prisma migrate deploy` (DATABASE_URL and TEST_DATABASE_URL pointing at the service), `npm run lint`, `npm run typecheck`, `npm test`. Provide all required env vars (JWT_ACCESS_SECRET >= 32 chars test value, FRONTEND_URL, REDIS_URL, etc.) in the job `env`.
- Job `web` (apps/web): checkout, setup-node 20 with cache, `npm ci`, `npm run lint`, `npm run typecheck`, `npm test --if-present`, `npm run build` (with API_URL and NEXT_PUBLIC_SOCKET_URL set to dummy values).
- Job `docker` (needs api and web): `docker build` both Dockerfiles (no push) to catch Dockerfile breakage.
- Use only well-known official actions with pinned major versions. No secrets required.
Also add a status badge to README.md (placeholder repo path to be corrected once pushed).
Explain every step briefly in comments in the YAML.
````

**Verify**
- [ ] Push; all three jobs are green on the latest commit. Fix any "works locally, fails in CI" issues (env vars, DB name, migration step).
- [ ] Badge URL points to the real repo and workflow filename.

**Commit:** `ci: github actions for lint, typecheck, tests and docker builds`

---

### Phase 12 — Deployment: Vercel + Render + hosted DB/Redis (≈1.5 h)

> Free-tier terms change. **Verify current limits** (instance sleep, Postgres expiry, Redis command quotas) before choosing. BullMQ polls Redis continuously and can exhaust per-request-billed free plans; prefer a fixed-price Redis instance or check the provider's BullMQ guidance. Choose a Postgres that will still exist for the whole review window.

**Steps (manual, do these yourself)**
1. **Postgres:** create a Neon (or Render) Postgres. Use the **direct (non-pooled)** connection string for `DATABASE_URL` so `prisma migrate deploy` works.
2. **Redis:** create a hosted Redis (Render Key Value / Upstash / equivalent). Use the TLS URL (`rediss://…`) if required.
3. **Render (API + WebSocket):** New → Web Service → connect repo → **Runtime: Docker**, **Root Directory:** `apps/api`, **Health Check Path:** `/health`. Environment variables: `NODE_ENV=production`, `PORT` (Render injects it; make sure the app reads `process.env.PORT`), `DATABASE_URL`, `REDIS_URL`, `JWT_ACCESS_SECRET` (long random), `FRONTEND_URL` (the exact Vercel production URL, no trailing slash), `RUN_WORKER=true`, `EXPOSE_INVITE_LINKS=true` (only if SMTP isn't configured), optional `SMTP_URL`, `LOG_LEVEL=info`.
4. **Vercel (frontend):** import repo → **Root Directory:** `apps/web` → env vars `API_URL=https://<your-render-service>.onrender.com` and `NEXT_PUBLIC_SOCKET_URL=https://<your-render-service>.onrender.com` → deploy. Then go back to Render and set `FRONTEND_URL` to the final Vercel URL and redeploy the API.
5. **Seed production** from your machine (Phase 13 seed script guarded by `ALLOW_SEED=true`):
   `ALLOW_SEED=true DATABASE_URL="<prod direct url>" npm run db:seed`

**Prompt (only for code changes this phase needs)**

````text
Context: #file:docs/ROADMAP.md (Locked decisions 5, 12, 13) #file:apps/api/src/server.ts #file:apps/api/Dockerfile

Prepare apps/api for Render:
1. Confirm server.ts listens on `process.env.PORT` (fallback 4000) and host 0.0.0.0.
2. Confirm cookies work behind Render's proxy (`trust proxy`, `secure` cookie in production).
3. Confirm Redis connections support `rediss://` URLs (TLS) and BullMQ uses `maxRetriesPerRequest: null`.
4. Confirm CORS/Socket.IO origin comes from FRONTEND_URL and that a missing FRONTEND_URL fails fast at startup in production.
5. Confirm the Docker CMD runs `prisma migrate deploy` before starting, and that startup retries the DB connection a few times (cold database).
6. Add a `docs/DEPLOYMENT.md` documenting the exact env vars and the order of deployment steps. Do not include real secrets.
List any change made.
````

**Verify (deployed, not localhost)**
- [ ] `https://<render>/health` → 200; `/health/ready` → 200.
- [ ] Open the Vercel site in two different browsers as Owner and Member → create/move tasks and see live updates (Network tab shows `wss://<render>…`).
- [ ] Wait for the Render instance to sleep (if applicable), reload: the "Waking up server…" banner appears and the app recovers.
- [ ] Login persists after refresh (cookie via Vercel rewrite works); logout works.
- [ ] An invite created in production yields a working accept link (or arrives by email).

**Commit:** `chore(deploy): render/vercel configuration and deployment docs`

---

### Phase 13 — Seed data, README, final QA, submission (≈1.25 h)

**Prompt**

````text
Context: #file:docs/ROADMAP.md (Sections 1, 5; Appendix B) #file:docs/DESIGN.md #file:.github/workflows/ci.yml

1. `apps/api/prisma/seed.ts` (idempotent, uses upsert/find-or-create; refuses to run when NODE_ENV=production unless ALLOW_SEED=true):
   - Workspace "Demo Workspace" with four users, all password `Passw0rd!demo`: owner@example.com (OWNER), admin@example.com (ADMIN), member@example.com (MEMBER), viewer@example.com (VIEWER).
   - A second workspace "Other Org" with other@example.com (OWNER), one board and a few tasks (so cross-tenant isolation can be demonstrated).
   - In Demo Workspace: board "Sprint Board" with lists "To Do", "In Progress", "Done"; ~12 tasks with realistic titles/descriptions, assignees, labels, statuses and due dates; positions generated via the ordering util; some activity log rows.
   - Print the credentials table at the end of the script.
2. Root `README.md` containing: title + CI badge; one-paragraph overview; live URLs placeholders (Vercel, Render); TEST ACCOUNTS table (email, password, role, workspace); architecture diagram (Mermaid) and component description; quick start from a clean checkout (`cp .env.example .env`, `docker compose up --build`, URLs/ports, how to run migrations/seed, how to run tests, running without Docker); environment variable tables for api and web; data model summary (link to docs/DESIGN.md ERD); authorization enforcement explanation (middleware chain + matrix); authentication, token storage and revocation strategy (rotation, reuse detection, why in-memory access token + httpOnly cookie, why REST goes through the Vercel rewrite); ordering and concurrency approach (fractional indexing, COLLATE "C", row locks, optimistic version); real-time design; caching and queue choices and why those two; failure handling behaviour; testing strategy and how to run each suite; trade-offs made under time pressure; known limitations (ownership transfer, no presence, offset pagination in search, token not enforced on live sockets beyond expiry timer, email depends on SMTP config); "what I'd do next".
3. Fill the "Trade-offs and known limitations" section of docs/DESIGN.md consistently with the README.
4. Add an `npm run test:all` convenience and a root-level section in README for it.
5. Final consistency pass: every item in ROADMAP Section 1 (traceability) points to something that exists. Report gaps; do not hide them.
````

**Final QA (do manually)**
- [ ] Fresh clone → `cp .env.example .env && docker compose up --build` → app usable with no other steps.
- [ ] CI green on the latest commit, badge works.
- [ ] Log in as each seeded role on the **deployed** site and verify: Owner can invite/change roles; Admin limits; Member edits tasks; Viewer is read-only and gets 403 via direct API call.
- [ ] Two-browser live demo works on the deployed URLs.
- [ ] Commit history is incremental (one or more commits per phase).
- [ ] No secrets in the repo (`git log -p | grep -i secret` sanity check; `.env` ignored).

**Commit:** `docs: seed script, README and final design notes`

---

## 9. Submission checklist (from the PDF)

- [ ] GitHub repo link (public or shared) with CI workflow file and passing badge/status
- [ ] Live Vercel URL (frontend)
- [ ] Live Render URL (API + WebSocket)
- [ ] Design note / README covering data model, authorization, caching/queue choices, known limitations
- [ ] Two working test accounts in different roles (Owner + Member, plus Admin and Viewer)
- [ ] Docker Compose reproduction instructions from a clean checkout
- [ ] Tests: unit (authorization rules, ordering) + integration (auth, task mutations)

---

## 10. Time plan (≈30 h)

| Phase | Hours | Cumulative |
|---|---:|---:|
| 0 Design + Copilot setup | 1.5 | 1.5 |
| 1 Scaffold + Docker | 1.5 | 3.0 |
| 2 Schema + migrations | 1.5 | 4.5 |
| 3 Auth | 3.0 | 7.5 |
| 4 Tenancy + RBAC | 3.0 | 10.5 |
| 5 Core domain + concurrency | 3.5 | 14.0 |
| 6 Search + activity | 2.0 | 16.0 |
| 7 Real-time | 2.5 | 18.5 |
| 8 Cache + queue | 2.0 | 20.5 |
| 9 Hardening | 1.0 | 21.5 |
| 10 Frontend (a+b+c) | 5.0 | 26.5 |
| 11 CI | 0.75 | 27.25 |
| 12 Deploy | 1.5 | 28.75 |
| 13 Seed + README + QA | 1.25 | 30.0 |

**If you run short on time, cut in this order:** frontend polish (10c charts, conflict-resolution UI), then Phase 9 extras. **Never cut:** tenant isolation tests, RBAC matrix test, concurrency tests, CI, deployment. The PDF says it prefers fewer features implemented rigorously.

Stretch goals (presence, CSV export via queue, per-user rate limiting) only after Phase 13 is complete.

---

## 11. Pitfalls checklist (the usual ways this project goes wrong)

| Pitfall | Prevention |
|---|---|
| Position ordering wrong in production | `COLLATE "C"` on position columns (Phase 2 test proves it) |
| Two users get duplicate positions | Row lock on list + unique `(listId, position)` + concurrency tests |
| Events sent for rolled-back writes | Publish only after commit |
| Cross-tenant leak via ID | `workspaceId` in every `where`; isolation tests in every module |
| Viewer can mutate via API | RBAC matrix test + router-walk guard (Phase 9) |
| Refresh cookie not sent in production | Vercel rewrite for REST (first-party cookie), `trust proxy`, `secure` cookie |
| WebSocket blocked through Vercel | Browser connects to Render directly |
| `NEXT_PUBLIC_*` undefined in Docker | Pass as **build** arg, not runtime env |
| BullMQ crashes with ioredis | `maxRetriesPerRequest: null` |
| argon2/Prisma native build errors | `node:20-bookworm-slim` + `openssl`, not alpine |
| Prisma CLI missing in prod image | Keep `prisma` in `dependencies` for `migrate deploy` |
| Flaky parallel DB tests | Serial integration tests (`fileParallelism: false`) |
| Render cold start looks like an outage | Warm-up banner, socket reconnect + resync |
| Stale UI after reconnect | Refetch snapshot on every socket `connect` |
| Stack traces leaking | Central error handler + production-mode test |

---

## Appendix A — Prisma schema (use EXACTLY; Prisma 6 syntax)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role {
  OWNER
  ADMIN
  MEMBER
  VIEWER
}

enum TaskStatus {
  TODO
  IN_PROGRESS
  DONE
}

model User {
  id           String   @id @default(uuid()) @db.Uuid
  email        String   @unique
  name         String
  passwordHash String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  memberships   Membership[]
  refreshTokens RefreshToken[]
  invitesSent   Invitation[]   @relation("InvitedBy")
  boardsCreated Board[]        @relation("BoardCreator")
  tasksCreated  Task[]         @relation("TaskCreator")
  tasksAssigned Task[]         @relation("TaskAssignee")
  activities    ActivityLog[]
}

model Workspace {
  id        String   @id @default(uuid()) @db.Uuid
  name      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  memberships Membership[]
  invitations Invitation[]
  boards      Board[]
  lists       List[]
  tasks       Task[]
  labels      Label[]
  activities  ActivityLog[]
}

model Membership {
  id          String   @id @default(uuid()) @db.Uuid
  workspaceId String   @db.Uuid
  userId      String   @db.Uuid
  role        Role
  createdAt   DateTime @default(now())

  workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([workspaceId, userId])
  @@index([userId])
}

model Invitation {
  id          String    @id @default(uuid()) @db.Uuid
  workspaceId String    @db.Uuid
  email       String
  role        Role
  tokenHash   String    @unique
  invitedById String    @db.Uuid
  expiresAt   DateTime
  acceptedAt  DateTime?
  revokedAt   DateTime?
  createdAt   DateTime  @default(now())

  workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  invitedBy User      @relation("InvitedBy", fields: [invitedById], references: [id], onDelete: Cascade)

  @@index([workspaceId])
  @@index([email])
}

model RefreshToken {
  id        String    @id @default(uuid()) @db.Uuid
  userId    String    @db.Uuid
  familyId  String    @db.Uuid
  tokenHash String    @unique
  expiresAt DateTime
  revokedAt DateTime?
  createdAt DateTime  @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([familyId])
}

model Board {
  id          String   @id @default(uuid()) @db.Uuid
  workspaceId String   @db.Uuid
  name        String
  description String?
  createdById String   @db.Uuid
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  createdBy User      @relation("BoardCreator", fields: [createdById], references: [id])
  lists     List[]
  tasks     Task[]

  @@index([workspaceId])
}

model List {
  id          String   @id @default(uuid()) @db.Uuid
  workspaceId String   @db.Uuid
  boardId     String   @db.Uuid
  name        String
  position    String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  board     Board     @relation(fields: [boardId], references: [id], onDelete: Cascade)
  tasks     Task[]

  @@unique([boardId, position])
  @@index([workspaceId])
}

model Task {
  id          String     @id @default(uuid()) @db.Uuid
  workspaceId String     @db.Uuid
  boardId     String     @db.Uuid
  listId      String     @db.Uuid
  title       String
  description String?
  status      TaskStatus @default(TODO)
  position    String
  assigneeId  String?    @db.Uuid
  createdById String     @db.Uuid
  dueDate     DateTime?
  version     Int        @default(1)
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt

  workspace Workspace   @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  board     Board       @relation(fields: [boardId], references: [id], onDelete: Cascade)
  list      List        @relation(fields: [listId], references: [id], onDelete: Cascade)
  assignee  User?       @relation("TaskAssignee", fields: [assigneeId], references: [id], onDelete: SetNull)
  createdBy User        @relation("TaskCreator", fields: [createdById], references: [id])
  labels    TaskLabel[]

  @@unique([listId, position])
  @@index([boardId])
  @@index([workspaceId, status])
  @@index([workspaceId, assigneeId])
  @@index([workspaceId, updatedAt])
}

model Label {
  id          String   @id @default(uuid()) @db.Uuid
  workspaceId String   @db.Uuid
  name        String
  color       String
  createdAt   DateTime @default(now())

  workspace Workspace   @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  tasks     TaskLabel[]

  @@unique([workspaceId, name])
}

model TaskLabel {
  taskId  String @db.Uuid
  labelId String @db.Uuid

  task  Task  @relation(fields: [taskId], references: [id], onDelete: Cascade)
  label Label @relation(fields: [labelId], references: [id], onDelete: Cascade)

  @@id([taskId, labelId])
  @@index([labelId])
}

model ActivityLog {
  id          String   @id @default(uuid()) @db.Uuid
  workspaceId String   @db.Uuid
  actorId     String?  @db.Uuid
  action      String
  entityType  String
  entityId    String?
  metadata    Json?
  createdAt   DateTime @default(now())

  workspace Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  actor     User?     @relation(fields: [actorId], references: [id], onDelete: SetNull)

  @@index([workspaceId, createdAt(sort: Desc), id(sort: Desc)])
}
```

**Notes on the schema**
- `Task.workspaceId`/`boardId`/`listId` are intentionally denormalized so every query can be scoped by `workspaceId` cheaply. Services must keep them consistent (tested in Phase 5).
- A `Label` shared across workspaces is prevented at the application layer (label must belong to the task's workspace); a composite-FK enforcement is listed as a "what I'd do next".
- Collation (`"C"`) and the FTS GIN index are added by the second migration (Phase 2), because Prisma cannot express them in `schema.prisma`.

---

## Appendix B — Environment variables

**apps/api**

| Variable | Example (dev) | Notes |
|---|---|---|
| `NODE_ENV` | `development` | `production` on Render |
| `PORT` | `4000` | Render injects its own |
| `DATABASE_URL` | `postgresql://postgres:postgres@postgres:5432/app` | Direct (non-pooled) URL for migrations |
| `TEST_DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/app_test` | Used by tests |
| `REDIS_URL` | `redis://redis:6379` | `rediss://` for TLS providers |
| `JWT_ACCESS_SECRET` | *(≥ 32 random chars)* | Fail fast if shorter |
| `ACCESS_TOKEN_TTL` | `15m` | |
| `REFRESH_TOKEN_TTL_DAYS` | `7` | |
| `FRONTEND_URL` | `http://localhost:3000` | Exact origin, no trailing slash. CORS, Socket.IO and CSRF origin check |
| `RUN_WORKER` | `false` (compose) / `true` (Render) | Embed BullMQ worker in API |
| `SMTP_URL` | `smtp://mailpit:1025` | Unset = JSON transport (logs only) |
| `MAIL_FROM` | `Workspace <no-reply@example.com>` | |
| `EXPOSE_INVITE_LINKS` | `false` | `true` only for demos without SMTP |
| `ALLOW_SEED` | *(unset)* | Required to seed when `NODE_ENV=production` |
| `LOG_LEVEL` | `info` | |

**apps/web**

| Variable | Example (dev, in Docker) | Notes |
|---|---|---|
| `API_URL` | `http://api:4000` | Server-side rewrite target (runtime). On Vercel: the Render URL |
| `NEXT_PUBLIC_SOCKET_URL` | `http://localhost:4000` | **Build-time** (inlined). On Vercel: the Render URL |
