# Workspace App

[CI workflow](./.github/workflows/ci.yml)

A multi-tenant collaborative workspace app with authenticated workspaces, boards, lists, tasks, activity, search, realtime updates, and Redis-backed cache/queue scaffolding.

## Stack

- API: Node.js, Express, TypeScript, Prisma, PostgreSQL, Socket.IO
- Web: Next.js, React, Tailwind, TanStack Query
- Infrastructure: Docker Compose for local development, Redis for caching/queue work, Mailpit for SMTP testing

## Features

- Secure signup/login/logout with JWT access tokens and refresh token rotation
- Workspace membership and role-based access control
- Boards, lists, and task creation/move/update flows with fractional ordering
- Accessible activity feed and task search across workspaces
- Realtime board and workspace event broadcasting
- Redis-based dashboard cache and queue foundation with graceful fail-open behavior

## Live services

- Frontend (Vercel): configure after deployment
- API and WebSocket (Render): configure after deployment

The repository does not contain hosting credentials or a connected Git remote, so live URLs are intentionally not fabricated.

## Demo accounts

Run `npm run db:seed` from `apps/api` to create these local accounts. Password for each is `Passw0rd!demo`.

| Email | Role | Workspace |
| --- | --- | --- |
| `owner@example.com` | Owner | Demo Workspace |
| `admin@example.com` | Admin | Demo Workspace |
| `member@example.com` | Member | Demo Workspace |
| `viewer@example.com` | Viewer | Demo Workspace |
| `other@example.com` | Owner | Other Org |

## Local development

1. Install Node.js 20+ and PostgreSQL 16.
2. Copy the environment templates and adjust the connection strings for your local machine.
3. Start the local services:

```bash
cd /Users/riteshkumaryadav/Aashita assignment
docker compose up -d postgres redis mailpit
```

To start the complete containerized stack instead, run `docker compose up --build`. The API container applies committed Prisma migrations before it starts. The web image is built with the internal API rewrite target and a browser-facing local Socket.IO URL.

4. Install dependencies and run the app in each package:

```bash
cd apps/api
npm ci
npm run db:migrate
npm run dev

cd ../web
npm ci
npm run dev
```

5. Open the frontend at `http://localhost:3000` and the API at `http://localhost:4000`.

## Test and validation

```bash
cd apps/api
npm test
 npm run lint
 npm run typecheck

cd ../web
npm run lint
npm run typecheck
npm run build
```

For a repo-level convenience check:

```bash
npm run test:all
```

## CI status

The repository includes a GitHub Actions workflow that runs linting, type-checks, integration tests, and Docker builds for both the API and web app.

## Deployment notes

The roadmap calls for a Vercel frontend, Render API/WebSocket service, and hosted Postgres/Redis. Update the service URLs and secrets in the environment before deployment. See [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md) for the exact runtime variables and deployment order.

## Repository status

This project is aligned to the roadmap phases for auth, RBAC, board workflow, activity/search, realtime, caching, and frontend shell work. Remaining deployment and final QA tasks are tracked in the project roadmap.

## Architecture and security notes

The Next.js app calls the Express API through `/api/*` rewrites and connects directly to Socket.IO for live updates. Express uses Prisma with PostgreSQL for workspace-scoped data. Redis backs dashboard caching and BullMQ email jobs. See [docs/DESIGN.md](./docs/DESIGN.md) for the entity model, authorization matrix, token lifecycle, ordering, realtime behavior, and known limitations.

Every workspace route authenticates the caller, checks membership in the URL workspace, then applies a server-side role permission. Workspace-owned reads are scoped by `workspaceId`. The UI mirrors role permissions for usability; the API remains authoritative.

Access JWTs are held in memory in the browser. Refresh tokens are stored hashed in PostgreSQL and sent in an HTTP-only cookie; refresh rotates the token and reuse revokes its family. This keeps access tokens out of browser storage while allowing cookie-based session restore.

Task and list positions use fractional indexing with PostgreSQL `C` collation. Creation and moves lock the ordered parent/list rows, move operations scope the source task and destination list, and task edits use `version` checks to reject stale writes. Socket events publish after a successful database transaction. Clients use WebSockets and refetch snapshots on reconnect.

The dashboard cache has explicit invalidation and falls back to database reads when Redis is unavailable. Invite mail and digest jobs use BullMQ; queue failures are logged without failing the request that created the job. Email delivery needs a working `SMTP_URL` and `RUN_WORKER=true`.

Root environment variables are documented in `.env.example`; Vercel and Render deployment order and service settings are in [docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md). Search uses offset pagination; ownership transfer and presence indicators are not implemented. CI is defined in `.github/workflows/ci.yml`; branch status and public deployment URLs must be connected to the eventual shared repository and hosting accounts.
