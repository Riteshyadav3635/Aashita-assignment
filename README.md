# Workspace

Workspace is a full-stack collaboration app that gives teams one place to organize projects as workspaces, boards, lists, and tasks. It combines task planning, role-based access, activity history, search, and live updates so teams can coordinate work without relying on disconnected task lists.

## Live demo

- **Application:** <https://aashita-assignment-production-2436.vercel.app>
- **Login:** <https://aashita-assignment-production-2436.vercel.app/login>

## GitHub repository

<https://github.com/Riteshyadav3635/Aashita-assignment>

## Project overview

Workspace is designed for teams that need shared task tracking with workspace-level membership and permissions. Members create workspaces, organize work on kanban-style boards, search tasks, review activity, and see changes broadcast to connected clients. The API enforces tenant boundaries and permissions while PostgreSQL persists application data.

## Engineering highlights

- Next.js frontend and Express API deployed separately, integrated through REST rewrites and Socket.IO.
- Workspace-scoped authorization with role and permission checks on protected operations.
- Password hashing, short-lived access tokens, and rotating refresh-token sessions.
- PostgreSQL persistence through Prisma migrations, with optimistic task-version checks to detect stale updates.
- Zod request validation, structured API errors, request logging, and health/readiness endpoints.
- Optional Redis-backed caching, shared Socket.IO broadcasts, and BullMQ jobs, with core API operation able to continue when Redis is unavailable.
- Automated API and web tests, type checking, linting, and production builds.
- Responsive Next.js UI deployed on Vercel; Dockerized API and Socket.IO service deployed on Render.

## Key features

- Email and password registration, login, logout, session restoration, and password change.
- Multi-workspace membership with `OWNER`, `ADMIN`, `MEMBER`, and `VIEWER` roles.
- Workspace creation and management, member removal and role changes, and invitation creation, revocation, and acceptance.
- Board, list, task, and label create/read/update/delete operations.
- Task assignment, due dates, status changes, labels, drag-and-drop ordering, and cross-list moves.
- Optimistic task version checks to reject stale updates.
- Workspace dashboard totals, status summaries, overdue counts, recent activity, and task distribution.
- Activity history with actor/action filtering and cursor-based pagination.
- Full-text task search with board, status, assignee, and label filters.
- Authenticated Socket.IO updates for workspace and board changes, with client resynchronization after reconnect.
- Optional Redis-backed dashboard cache, Socket.IO adapter, and BullMQ email/digest work.
- Health and readiness endpoints.
- Local Docker Compose services for PostgreSQL, Redis, and Mailpit.

## Technology stack

| Area | Technologies used |
| --- | --- |
| Frontend | Next.js 15 App Router, React 19, TypeScript, Tailwind CSS, TanStack Query, React Hook Form, Zod, Socket.IO Client, dnd-kit |
| Backend | Node.js 20, Express 5, TypeScript, Socket.IO |
| Database | PostgreSQL 16, Prisma ORM and migrations |
| Authentication | Argon2id password hashing, short-lived JWT access tokens, opaque rotating refresh tokens |
| APIs | JSON REST endpoints; authenticated Socket.IO events for realtime updates |
| Cache and jobs | Redis with ioredis; BullMQ for invitation and digest email jobs |
| Email | Nodemailer over the configured SMTP URL; Mailpit is available for local development |
| Deployment/hosting | Vercel for the web app; Render for the API/WebSocket service; Docker images and Docker Compose |
| Development and tests | npm, TypeScript, ESLint, Vitest, Supertest, GitHub Actions |

## Project architecture

```text
User
  |
  v
Next.js frontend (Vercel or local browser)
  | REST through Next.js /api rewrites
  | Socket.IO over WebSocket
  v
Express API + Socket.IO server (Render or local Node process)
  | Prisma ORM
  +------------------> PostgreSQL
  +------------------> Redis (cache, Socket.IO adapter, BullMQ)
  +------------------> SMTP service (queued mail, when configured)
```

In development, the browser calls the frontend's `/api/*` routes. Next.js rewrites those requests to the API URL configured by `API_URL`. Socket.IO connects directly to the URL in `NEXT_PUBLIC_SOCKET_URL`. The API checks bearer access tokens, workspace membership, and role permissions, then uses Prisma to read or update PostgreSQL. Realtime events are published after successful writes. Redis enables shared Socket.IO broadcasts, dashboard caching, and background jobs; the API has degraded/fallback behavior when Redis is unavailable.

## Repository structure

```text
.
├── .env.example                 # Root environment template for local/Compose use
├── .github/workflows/ci.yml     # API, web, and Docker build checks
├── apps/
│   ├── api/
│   │   ├── prisma/
│   │   │   ├── migrations/      # PostgreSQL schema and search/index migrations
│   │   │   ├── schema.prisma    # Models and relations
│   │   │   └── seed.ts          # Development demo data
│   │   ├── src/
│   │   │   ├── config/          # Validated API environment configuration
│   │   │   ├── lib/             # Auth, Prisma, Redis, cache, queue, events, sockets
│   │   │   ├── middleware/      # Workspace membership and permission checks
│   │   │   ├── modules/         # Auth, invitations, workspaces, RBAC, activity
│   │   │   ├── app.ts           # Express middleware and route mounting
│   │   │   └── server.ts        # HTTP/Socket.IO startup and shutdown
│   │   ├── tests/
│   │   │   ├── integration/     # Database, API, RBAC, realtime, cache tests
│   │   │   └── unit/            # Ordering and smoke tests
│   │   ├── Dockerfile
│   │   └── package.json
│   └── web/
│       ├── src/
│       │   ├── app/             # App Router pages and workspace routes
│       │   ├── components/      # Board view, workspace shell, UI components
│       │   └── lib/             # API client, auth context, Socket.IO, types
│       ├── Dockerfile
│       ├── next.config.mjs      # REST API and health rewrites
│       ├── vercel.json          # Vercel framework/install/build configuration
│       └── package.json
├── docs/
│   ├── DESIGN.md                # Design, data model, auth, realtime, and trade-offs
│   └── DEPLOYMENT.md            # Deployment-specific configuration notes
├── docker-compose.yml           # PostgreSQL, Redis, Mailpit, API, and web services
├── render.yaml                  # Render API service definition
└── package.json                 # Root convenience scripts
```

## Frontend

The frontend is a Next.js App Router application written in TypeScript. Its main routes are:

| Route | Purpose |
| --- | --- |
| `/` | Landing and authenticated workspace entry |
| `/login` | Sign in |
| `/signup` | Create an account |
| `/invite/[token]` | Accept a workspace invitation |
| `/w/[workspaceId]` | Workspace dashboard |
| `/w/[workspaceId]/boards/[boardId]` | Board and task workflow |
| `/w/[workspaceId]/members` | Workspace members and invitations |
| `/w/[workspaceId]/activity` | Filterable activity feed |
| `/w/[workspaceId]/search` | Filterable task search |

`AuthProvider` maintains user, membership, and authentication state. TanStack Query manages server data and cache invalidation/refetching. The shared `apiFetch` client includes credentials, attaches an in-memory access token, attempts a refresh after an eligible `401`, and exposes structured API errors. Forms use the frontend's React form and schema-validation dependencies. Pages show loading, empty, and request-error states where relevant. The board view uses drag-and-drop controls and Socket.IO events to refresh current data.

## Backend and API

The backend is an Express 5 application in `apps/api`, written in TypeScript. `src/app.ts` configures Helmet, JSON parsing, cookie parsing, request logging, CORS, health endpoints, and API routes. `src/server.ts` starts the HTTP server, attaches Socket.IO, conditionally starts the email worker, and handles shutdown.

Route handlers validate request payloads with Zod and use Prisma for database operations. Workspace routes apply authentication, membership checks, and role permissions. Shared middleware and services live under `src/middleware`, `src/modules`, and `src/lib`.

All REST endpoints use the `/api` prefix except `/health` and `/health/ready`. In the table below, `:workspaceId`, `:boardId`, and similar segments are path parameters.

### Health endpoints

| Method | Endpoint | Purpose | Authentication required |
| --- | --- | --- | --- |
| `GET` | `/health` | Liveness check | No |
| `GET` | `/api/health` | API liveness check | No |
| `GET` | `/health/ready` | Database readiness plus Redis status (Redis is reported but is not a readiness gate) | No |

### Authentication and invitations

| Method | Endpoint | Purpose | Authentication required |
| --- | --- | --- | --- |
| `POST` | `/api/auth/signup` | Register and start a session | No |
| `POST` | `/api/auth/login` | Authenticate and start a session | No |
| `POST` | `/api/auth/refresh` | Rotate refresh token and issue an access token | Refresh cookie or `X-Refresh-Token` |
| `POST`, `DELETE` | `/api/auth/logout` | Revoke the user's refresh sessions and clear the cookie | No; authenticated user is used when supplied |
| `GET` | `/api/auth/me` | Return the authenticated user | Yes |
| `POST` | `/api/auth/change-password` | Change password and revoke refresh sessions | Yes |
| `POST` | `/api/invitations/accept` | Accept an invitation for the signed-in email | Yes |
| `POST` | `/api/workspaces/accept` | Accept an invitation (alternate mounted route) | Yes |

### Workspaces and members

| Method | Endpoint | Purpose | Authentication required |
| --- | --- | --- | --- |
| `GET` | `/api/workspaces` | List the caller's workspace memberships | Yes |
| `POST` | `/api/workspaces` | Create a workspace and make caller its owner | Yes |
| `GET`, `PATCH`, `DELETE` | `/api/workspaces/:workspaceId` | Read, rename, or delete a workspace | Yes; membership and role permission |
| `GET` | `/api/workspaces/:workspaceId/dashboard` | Read workspace summary metrics | Yes; workspace read permission |
| `GET` | `/api/workspaces/:workspaceId/members` | List members | Yes; workspace membership and member-list permission |
| `PATCH`, `DELETE` | `/api/workspaces/:workspaceId/members/:userId` | Change a member's role or remove them | Yes; workspace membership and role permission |
| `POST` | `/api/workspaces/:workspaceId/invitations` | Invite an email with a permitted role | Yes; workspace membership and invite permission |
| `GET` | `/api/workspaces/:workspaceId/invitations` | List pending invitations | Yes; workspace membership and member-list permission |
| `DELETE` | `/api/workspaces/:workspaceId/invitations/:invitationId` | Revoke a pending invitation | Yes; workspace membership and invite permission |

### Boards, lists, tasks, labels, and activity

| Method | Endpoint | Purpose | Authentication required |
| --- | --- | --- | --- |
| `GET`, `POST` | `/api/workspaces/:workspaceId/boards` | List or create boards | Yes; workspace membership (write permission to create) |
| `GET`, `PATCH`, `DELETE` | `/api/workspaces/:workspaceId/boards/:boardId` | Read, update, or delete a board | Yes; workspace membership (write/delete permission for changes) |
| `GET`, `POST` | `/api/workspaces/:workspaceId/boards/:boardId/lists` | List or create board lists | Yes; workspace membership (write permission to create) |
| `PATCH`, `DELETE` | `/api/workspaces/:workspaceId/boards/:boardId/lists/:listId` | Update or delete a list | Yes; workspace membership and list-write permission |
| `PATCH` | `/api/workspaces/:workspaceId/boards/:boardId/lists/:listId/move` | Reorder a list | Yes; workspace membership and list-write permission |
| `POST` | `/api/workspaces/:workspaceId/boards/:boardId/lists/:listId/tasks` | Create a task in a list | Yes; workspace membership and task-write permission |
| `GET`, `PATCH`, `DELETE` | `/api/workspaces/:workspaceId/boards/:boardId/tasks/:taskId` | Read, update, or delete a task | Yes; workspace membership (write permission for changes) |
| `PATCH` | `/api/workspaces/:workspaceId/boards/:boardId/tasks/:taskId/move` | Move/reorder a task | Yes; workspace membership and task-write permission |
| `GET`, `POST` | `/api/workspaces/:workspaceId/labels` | List or create workspace labels | Yes; workspace membership (write permission to create) |
| `PATCH`, `DELETE` | `/api/workspaces/:workspaceId/labels/:labelId` | Update or delete a label | Yes; workspace membership and label-write permission |
| `GET` | `/api/workspaces/:workspaceId/activity` | Read activity with filters and cursor pagination | Yes; workspace read permission |
| `GET` | `/api/workspaces/:workspaceId/search` | Search and filter workspace tasks | Yes; workspace read permission |
| `GET` | `/api/workspaces/:workspaceId/tasks/search` | Task-search alias | Yes; workspace read permission |
| `POST` | `/api/workspaces/:workspaceId/digest/send` | Queue a workspace digest | Yes; workspace membership and digest permission |

### Realtime events

The Socket.IO server is mounted on the API HTTP server. Clients authenticate with the current access token in the handshake, then request `workspace:join` or `board:join`. The server verifies membership before joining rooms. It broadcasts events for workspace, membership, board, list, task, invitation, and label changes. The frontend reconnects and refetches snapshots to resynchronize.

## Database

PostgreSQL is the system of record. Prisma reads `DATABASE_URL` at runtime, and the Prisma schema and SQL migrations are in `apps/api/prisma`. The main models are:

| Model | Purpose and relationships |
| --- | --- |
| `User` | Account identity and Argon2 password hash; related to memberships, refresh tokens, invitations, created/assigned tasks, boards, and activity |
| `Workspace` | Tenant root for memberships, invitations, boards, lists, tasks, labels, and activity |
| `Membership` | Links a user to a workspace with one of the four roles; unique per workspace/user |
| `Invitation` | Workspace invite with email, role, hashed token, expiry, and acceptance/revocation timestamps |
| `RefreshToken` | Hashed refresh token, token family, expiry, and revocation state |
| `Board` | Workspace board with creator, lists, and tasks |
| `List` | Board column with fractional string position and tasks |
| `Task` | Board/list item with status, position, optional assignee/due date, labels, and optimistic `version` |
| `Label` | Workspace-scoped label and color |
| `TaskLabel` | Join model connecting tasks and labels |
| `ActivityLog` | Workspace activity actor, action, entity, JSON metadata, and timestamp |

The schema defines PostgreSQL enums for `Role` and `TaskStatus`. Foreign keys and unique constraints enforce core relationships; workspace-aware API queries provide tenant scoping. Task search uses PostgreSQL full-text search and an index created by the migrations. List/task positions are strings using PostgreSQL `C` collation to support fractional ordering.

## Authentication and authorization

- Sign-up and login accept an email and password. Passwords are hashed with Argon2id; plaintext passwords are not stored.
- Access JWTs use HS256, have a 15-minute lifetime, and are held in frontend memory rather than browser local storage.
- A random opaque refresh token is returned in a `HttpOnly`, `SameSite=Lax` cookie scoped to `/api/auth` (secure cookies in production). The database stores only its SHA-256 hash. Refresh tokens last seven days and rotate when used; reuse of a revoked/expired token revokes its token family.
- The frontend automatically attempts a refresh after an eligible `401`; if refresh fails, the user is signed out and redirected to sign in.
- Logout revokes active refresh sessions and clears the cookie. Password change verifies the current password, stores a new Argon2id hash, and revokes active refresh tokens so the user must sign in again.
- Protected REST routes require an access token. Workspace handlers additionally check membership in the requested workspace and enforce a permission matrix on the server.
- Owners and admins have broad workspace management rights, members can write board/task data but have narrower membership rights, and viewers have read-only workspace access. Specific invitation/member actions have additional role checks.
- Socket.IO connections authenticate with an access token and can only join workspace/board rooms when the user is a member.

## Environment variables

Create environment files locally; do not put production values in this README. The API loads `.env` from its working directory via `dotenv`. Next.js loads its app environment from `apps/web/.env.local`. Docker Compose reads the root `.env` as the API/web `env_file`; the Compose service configuration also provides container-specific addresses.

| Variable | Purpose | Example/format (placeholder) | Required |
| --- | --- | --- | --- |
| `NODE_ENV` | API runtime mode (`development`, `test`, or `production`) | `development` | No; defaults to development |
| `PORT` | API listen port | `4000` | No; defaults to `4000` |
| `HOST` | API bind host | `0.0.0.0` | No; server defaults to `0.0.0.0` |
| `DATABASE_URL` | Prisma PostgreSQL connection string | `postgresql://user:your_password@localhost:5432/app?schema=public` | Required for database operation; code has a local default |
| `TEST_DATABASE_URL` | Database used by API tests | `postgresql://user:your_password@localhost:5432/app_test?schema=public` | Required for isolated DB tests; falls back to `DATABASE_URL` |
| `JWT_ACCESS_SECRET` | Signs access tokens; must be at least 32 characters | `your_long_random_access_secret` | Set a unique secret in production; code has an unsafe development fallback |
| `JWT_REFRESH_SECRET` | Refresh secret required by API environment validation | `your_long_random_refresh_secret` | Set a unique 32+ character value in production; code has a development fallback |
| `JWT_SECRET` | Legacy fallback name for the access-token secret | `your_legacy_secret_if_needed` | No; prefer `JWT_ACCESS_SECRET` |
| `REDIS_URL` | Redis connection for cache, queue, and Socket.IO adapter | `redis://localhost:6379` | No for basic API operation; needed for Redis-backed features |
| `SMTP_URL` | SMTP transport for invitation and digest email jobs | `smtp://localhost:1025` | No for non-email functionality; configure a real SMTP service to send mail |
| `FRONTEND_URL` | Exact allowed frontend origin for REST CORS, Socket.IO CORS, and invite links | `https://your-frontend.example` | Required in production |
| `API_URL` | Backend destination for Next.js `/api/*` and `/health` rewrites | `http://localhost:4000` | Set for the web app; defaults to localhost |
| `NEXT_PUBLIC_SOCKET_URL` | API origin used by browser Socket.IO client | `http://localhost:4000` | Set for the web app; defaults to localhost |
| `SOCKET_URL` | Present in the API environment schema and local template; the current frontend Socket.IO client uses `NEXT_PUBLIC_SOCKET_URL` | `http://localhost:4000` | No |
| `APP_NAME` | API metadata setting | `workspace` | No |
| `APP_VERSION` | API metadata setting | `0.1.0` | No |
| `RUN_WORKER` | Starts the BullMQ email worker and daily digest scheduler when exactly `true` | `true` | No; optional background jobs |
| `EXPOSE_INVITE_LINKS` | Includes invite token/link in API invite response when exactly `true` | `false` | No; keep disabled in production unless intentionally required |
| `LOG_LEVEL` | Pino log level | `info` | No |
| `ALLOW_SEED` | Explicitly permits running the seed script in production | `true` | No; only relevant for a deliberate production seed |
| `API_PORT`, `WEB_PORT` | Present in the root template as port labels | `4000`, `3000` | No; current Compose mappings are explicitly configured |

The API schema supports `JWT_SECRET` as an access-secret compatibility fallback. `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` must be at least 32 characters. Access JWTs are signed with `JWT_ACCESS_SECRET`; refresh tokens are opaque random values stored as hashes rather than JWTs, so `JWT_REFRESH_SECRET` is currently validated configuration but is not used to sign refresh tokens. Use independently generated values in production. The `NEXT_PUBLIC_*` value is bundled into browser code and must never contain a secret.

## `.gitignore` and security

The root `.gitignore` excludes `.env` and `.env.*` files while explicitly allowing `.env.example`; it also excludes dependencies, build output, coverage, logs, and TypeScript build metadata. The web app's `.gitignore` excludes `.env*` and `.vercel`. Keep real environment files out of commits, and review staged files before pushing. If a secret is ever committed, revoke/rotate it; deleting the value in a later commit is not sufficient.

## Installation and local setup

### Prerequisites

- Node.js 20 or newer and npm.
- Docker with the Docker Compose plugin for the provided local PostgreSQL, Redis, and Mailpit services.
- Git.

### Fresh clone and dependencies

```bash
git clone https://github.com/Riteshyadav3635/Aashita-assignment.git
cd Aashita-assignment

cd apps/api
npm ci
npx prisma generate
cd ../web
npm ci
cd ../..
```

### Start local infrastructure

Copy the root template for Compose, then start the database, Redis, and Mailpit:

```bash
cp .env.example .env
docker compose up -d postgres redis mailpit
```

The Compose PostgreSQL service uses local development credentials configured in `docker-compose.yml`; do not reuse them outside local development. The API integration tests use `TEST_DATABASE_URL`, so create a separate test database in the local PostgreSQL service:

```bash
docker compose exec postgres createdb -U app app_test
```

### Configure and migrate the API

Create `apps/api/.env` and set values for your local services. For PostgreSQL, use the Compose database host from the host machine (`localhost`) and the local credentials configured in `docker-compose.yml`; the sample below uses placeholders rather than credentials:

```dotenv
NODE_ENV=development
PORT=4000
DATABASE_URL=postgresql://app:your_local_password@localhost:5432/app?schema=public
TEST_DATABASE_URL=postgresql://app:your_local_password@localhost:5432/app_test?schema=public
REDIS_URL=redis://localhost:6379
SMTP_URL=smtp://localhost:1025
FRONTEND_URL=http://localhost:3000
JWT_ACCESS_SECRET=replace-with-a-random-secret-of-at-least-32-characters
JWT_REFRESH_SECRET=replace-with-another-random-secret-of-at-least-32-characters
APP_NAME=workspace
APP_VERSION=0.1.0
```

Update the local database password in both connection URLs to match your local PostgreSQL configuration. Apply migrations and optionally seed development data:

```bash
cd apps/api
npm run db:migrate
# Optional: creates demo users, a workspace, a board, tasks, and labels.
npm run db:seed
```

The seed script is for development/test data only. It uses fixed demo-account passwords, so never use seeded accounts in a production deployment. Production seeding is blocked unless `ALLOW_SEED=true` is deliberately set.

### Configure and start the frontend

Create `apps/web/.env.local`:

```dotenv
API_URL=http://localhost:4000
NEXT_PUBLIC_SOCKET_URL=http://localhost:4000
```

Run each app in a separate terminal:

```bash
# Terminal 1
cd apps/api
npm run dev
```

```bash
# Terminal 2
cd apps/web
npm run dev
```

Open <http://localhost:3000>. The API liveness endpoint is <http://localhost:4000/health>.

## Running with Docker Compose

The root `docker-compose.yml` defines PostgreSQL, Redis, Mailpit, the API, and the web app. Copy `.env.example` to `.env`, replace development placeholder secrets, and then run:

```bash
docker compose up --build
```

The API image applies Prisma migrations before server startup. Compose publishes the web app on port `3000`, the API on `4000`, PostgreSQL on `5432`, Redis on `6379`, SMTP on `1025`, and the Mailpit UI on `8025`. Open the app at <http://localhost:3000> and Mailpit at <http://localhost:8025>.

## API usage

The frontend uses relative `/api/...` URLs; Next.js rewrites REST calls to `API_URL`. For direct requests, use the API origin and supply the bearer access token for protected endpoints.

Liveness check:

```bash
curl https://workspace-api-4vp0.onrender.com/health
```

Login request shape (use your own account; no live credentials are included here):

```bash
curl -X POST https://workspace-api-4vp0.onrender.com/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"your_password"}'
```

For protected calls, send `Authorization: Bearer <access-token>`. The browser also sends the refresh cookie automatically when making API requests. Errors use a JSON envelope containing an error `code`, `message`, `requestId`, and, for validation errors, issue details. A task search request can use:

```text
GET /api/workspaces/:workspaceId/search?q=onboarding&status=TODO&page=1&pageSize=20
```

Supported search filters include `q`, `boardId`, `status`, `assigneeId` (including `unassigned`), and `labelId`.

## Database setup and migrations

For local development, start PostgreSQL with Docker Compose and set `DATABASE_URL` to the local database. Run `npm run db:migrate` from `apps/api` to apply development migrations. `npm run db:deploy` runs committed migrations for deployment; the API Dockerfile runs `prisma migrate deploy` at startup. `npm run db:seed` loads optional development data. `npm run db:studio` launches Prisma Studio.

Use a separate database URL for API tests through `TEST_DATABASE_URL`. The test helper applies migrations and truncates its database before integration tests; never point it at a database containing data you want to keep.

## Testing and quality checks

API and frontend tests use Vitest. API HTTP/integration tests use Supertest and a PostgreSQL test database; integration coverage includes authentication/RBAC, boards/lists/tasks, activity/search, database ordering, health validation, realtime behavior, and dashboard cache behavior. Unit tests cover ordering and basic smoke cases. The web package contains an API-client test.

Run the API suite and quality checks:

```bash
cd apps/api
npm test
npm run lint
npm run typecheck
```

Run API unit-only or integration-only tests with `npm run test:unit` or `npm run test:integration`. The integration suite requires `TEST_DATABASE_URL` (or `DATABASE_URL` as fallback) pointing to a disposable PostgreSQL database.

Run web checks:

```bash
cd apps/web
npm test
npm run lint
npm run typecheck
npm run build
```

At the repository root, `npm run test:all` runs the API test suite and then builds the web app. GitHub Actions additionally runs API and web checks and builds both Docker images.

## Production build

Build each application with the package scripts:

```bash
cd apps/api
npm run build

cd ../web
npm run build
```

The API build compiles TypeScript to `dist`; the web build produces the Next.js production output. The API Dockerfile and web Dockerfile also define container builds for their respective applications.

## Deployment

The repository contains deployment configuration for **Vercel (frontend)** and **Render (API/WebSocket)**. The backend is configured for Render, not Railway. The Dockerized API can be deployed elsewhere, but another platform would need its service settings, health checks, environment variables, and database/Redis connections configured separately.

### Frontend on Vercel

1. Import the repository into Vercel and set the project root to `apps/web`.
2. The committed `apps/web/vercel.json` specifies Next.js, `npm ci`, and `npm run build`.
3. Configure `API_URL` as the Render API origin and `NEXT_PUBLIC_SOCKET_URL` as the same API origin. The latter is public and is embedded in the frontend bundle.
4. Set the production domain/origin in the backend's `FRONTEND_URL`, then redeploy the backend if needed.

### Backend on Render

`render.yaml` defines a Docker web service rooted at `apps/api`, using its `Dockerfile`, with `/health` as its health check. Configure the production `DATABASE_URL`, a strong unique `JWT_ACCESS_SECRET`, a strong unique `JWT_REFRESH_SECRET`, the exact Vercel `FRONTEND_URL`, and `REDIS_URL` if Redis-backed features are required. Set `SMTP_URL` to an SMTP provider to deliver invitation/digest email. `RUN_WORKER=true` starts the BullMQ worker and digest scheduler. The container runs Prisma migrations before starting the API.

The readiness endpoint is `/health/ready`; it reports database and Redis status. The API can continue in a degraded mode without Redis, but caching, queued email work, and cross-instance Socket.IO broadcast behavior depend on Redis.

### Production build and runtime

The API Dockerfile builds TypeScript and starts `node dist/src/server.js` after `prisma migrate deploy`. The web Dockerfile builds Next.js standalone output and starts its standalone server. Vercel uses the configured Next.js build rather than the web Dockerfile.

## Challenges and engineering decisions

- **Separate web and API origins:** REST calls use the Next.js `/api` rewrite while Socket.IO connects directly to the API. This keeps the browser/API integration explicit and lets the API apply credentialed CORS for the configured frontend origin.
- **Workspace data isolation:** Requests are authenticated and checked against workspace membership and role permissions; task updates also use a version field to identify stale writes.
- **Optional Redis dependency:** PostgreSQL is the readiness requirement. Redis-backed caching, queue processing, and cross-instance Socket.IO broadcasts are optional capabilities, and the API has degraded behavior when Redis is unavailable.

## Production architecture and live deployment

```text
User
  ↓
Vercel: Next.js frontend
  ├── REST (rewritten /api/*) ───────┐
  └── Socket.IO (direct connection) ─┤
                                     ↓
                          Render: Express + Socket.IO
                                     ↓
                              PostgreSQL
                                     ↕
                             Redis (optional)
                                     ↓
                                SMTP (optional)
```

- **Frontend:** <https://aashita-assignment-production-2436.vercel.app>
- **Backend API:** <https://workspace-api-4vp0.onrender.com>
- **API health:** <https://workspace-api-4vp0.onrender.com/health>
- **Repository:** <https://github.com/Riteshyadav3635/Aashita-assignment>

Redis/email job functionality depends on the corresponding production services and valid configuration; the application has explicit Redis-degraded behavior.

## Validation and error handling

The API validates request bodies and query parameters with Zod. Invalid Zod input returns HTTP `400` with a structured `VALIDATION_ERROR` response. Application errors use appropriate HTTP status codes and error codes; unexpected errors return a generic message in production. Request IDs are included in error responses, and API requests are logged with Pino. JSON request bodies are limited to 100 KB.

The frontend API client parses the error envelope into `ApiError`, handles `204 No Content`, and attempts session refresh when an authenticated request receives `401`. UI pages expose loading, empty, and error states for their data requests.

## Security considerations

- Argon2id password hashing; refresh and invitation token hashes are stored instead of their raw values.
- HS256 access JWTs have a 15-minute expiry. Refresh tokens are HttpOnly, SameSite=Lax cookies with a seven-day expiry and production `Secure` flag.
- Refresh rotation and token-family revocation address token reuse; password changes and logout revoke refresh sessions.
- Authentication endpoints have a rate limit of 20 requests per 15 minutes.
- Helmet, exact-origin credentialed CORS, workspace membership checks, role-based authorization, and Zod input validation are used.
- Prisma parameterizes database queries, including the raw SQL search query, and the API scopes domain reads/writes to workspace identifiers.
- Secrets belong in local ignored environment files or hosting-provider secret settings. Never commit production credentials or put secrets in `NEXT_PUBLIC_*` variables.
- `EXPOSE_INVITE_LINKS=true` returns invitation links in API responses; use this only when the behavior is explicitly intended and protect access to those responses.

## Troubleshooting

| Symptom | Checks |
| --- | --- |
| API cannot connect to PostgreSQL | Confirm PostgreSQL is running, `DATABASE_URL` uses the correct host/port and credentials, and migrations have been applied. From the host, a Compose database is reached at `localhost`, not the Compose service name. |
| Integration tests cannot connect or report missing tables | Create the test database, set `TEST_DATABASE_URL`, then run the API tests. The test helper migrates and truncates the configured test database. |
| Browser API calls fail or cookies do not persist | Check `API_URL`, `FRONTEND_URL`, and that frontend origin matches the CORS origin exactly. In production use HTTPS and allow credentials. |
| Browser shows session expired | Sign in again. Check that the access/refresh secrets are stable across deploys and the API can reach PostgreSQL. |
| Board does not receive live updates | Check `NEXT_PUBLIC_SOCKET_URL`, API Socket.IO origin/CORS configuration, browser network connectivity, and access-token validity. The client refetches data when reconnecting. |
| Redis warnings appear | Verify `REDIS_URL` and Redis availability. Core API/database functions can run with Redis degraded, but cache, queue, and multi-instance socket features may be unavailable. |
| Invitation or digest emails are not delivered | Configure a reachable `SMTP_URL`, enable `RUN_WORKER=true`, and confirm Redis is available for BullMQ. Mailpit is provided for local email inspection. |
| Vercel requests reach the wrong API | Set Vercel's `API_URL` to the backend origin and redeploy. Set `NEXT_PUBLIC_SOCKET_URL` to the same origin for realtime connections. |
| Render deploy fails during startup | Check Docker build logs, `DATABASE_URL`, migration logs, `/health`, and required production values including `FRONTEND_URL` and JWT secrets. |

## Future improvements

These are potential enhancements, not claims about currently implemented functionality:

- Add an account-security settings page that uses the existing password-change API.
- Add browser end-to-end tests and deployment smoke tests.
- Add presence indicators and workspace ownership transfer.
- Improve task conflict-resolution UX and expose richer operational metrics.
- Add explicit service health/alerting and production email-provider verification.

## Screenshots

No screenshot assets are currently included in the repository.

## License

No license has been specified yet.

## Author

Ritesh Yadav

## Live demo and repository

- **Live application:** <https://aashita-assignment-production-2436.vercel.app>
- **GitHub:** <https://github.com/Riteshyadav3635/Aashita-assignment>
