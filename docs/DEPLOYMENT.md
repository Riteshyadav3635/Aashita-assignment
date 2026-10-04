# Deployment notes

This project is prepared for a Render API/WebSocket deployment and a Vercel frontend deployment.

## Required runtime env vars

### API (`apps/api` on Render)

- `NODE_ENV=production`
- `PORT` (Render provides this automatically)
- `DATABASE_URL` — direct Postgres connection string (not pooled)
- `REDIS_URL` — Redis URL; rediss:// is supported by the ioredis client
- `JWT_ACCESS_SECRET` — long random secret, at least 32 chars
- `JWT_REFRESH_SECRET` — long random secret, at least 32 chars
- `FRONTEND_URL` — exact Vercel production URL, no trailing slash
- `SMTP_URL` — optional, for invite email delivery
- `RUN_WORKER=true` — enables the queue worker process
- `APP_NAME` and `APP_VERSION` — optional metadata

### Web (`apps/web` on Vercel)

- `API_URL` — Render API base URL, for example `https://workspace-api.onrender.com`
- `NEXT_PUBLIC_SOCKET_URL` — Render WebSocket URL, for example `https://workspace-api.onrender.com`

## Deployment order

1. Create and verify the Postgres database and Redis instance.
2. Deploy the API to Render using the `apps/api` Dockerfile.
3. Set `FRONTEND_URL` to the final Vercel URL and redeploy the API once the frontend URL is known.
4. Deploy the web app to Vercel with the `apps/web` root directory selected.
5. Validate `/health`, `/health/ready`, login flow, socket updates, and invite acceptance.

## Render-specific notes

- The API listens on `0.0.0.0` and uses `PORT` from the environment.
- Express trusts a proxy so cookies behave correctly behind Render's load balancer.
- Refresh cookies are sent with `secure: true` in production, which is required for browser cookie persistence on HTTPS.
- Redis is configured with `maxRetriesPerRequest: null` so BullMQ can handle retry behavior without crashing on hosted Redis connections.
- Socket.IO uses the same `FRONTEND_URL` origin for CORS and the `board:join` / `workspace:join` auth flow.
- The Docker command runs Prisma migrations before startup to handle cold starts and database readiness.

## Vercel-specific notes

- The frontend connects to the Render API directly for REST and WebSocket traffic; Vercel does not proxy the socket layer.
- Because the backend is behind a hosted origin, the browser must use the direct Render URL rather than the Vercel host for socket transport.

## Verification checklist

- `https://<render>/health` returns HTTP 200
- `https://<render>/health/ready` returns HTTP 200 once Postgres and Redis are healthy
- Login persists across refreshes with cookie-based refresh flow
- Board task updates stream over WebSocket and re-sync after reconnects
- Invite links open correctly when the API is configured to expose them
