# Self-hosting (optional)

The supported production setup is Vercel + Supabase cloud. This page is for the case where UNN ICT
wants to run the site on university servers instead.

## Application

The `Dockerfile` builds a self-contained Node.js server (Next.js `standalone` output, ~350 MB image,
runs as a non-root user, built-in `HEALTHCHECK` on `/api/health/live`).

```bash
docker build \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=https://supabase.awlel.unn.edu.ng \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key> \
  --build-arg NEXT_PUBLIC_SITE_URL=https://awlel.unn.edu.ng \
  -t awlel-web .

docker run -d --name awlel-web -p 3000:3000 --env-file /etc/awlel/web.env --restart unless-stopped awlel-web
```

`NEXT_PUBLIC_*` values are compiled into the browser bundle, so they are build arguments. Server secrets
(`SUPABASE_SERVICE_ROLE_KEY`, `METRICS_SALT`, `RESEND_API_KEY`, ...) go in the runtime env file, never in
the image.

Put a TLS-terminating reverse proxy (nginx, Caddy or the university load balancer) in front of port 3000.
Use `/api/health/live` as the liveness probe and `/api/health/ready` as the readiness probe.

## Supabase

Run Supabase with its official self-hosting Docker Compose setup
(<https://supabase.com/docs/guides/self-hosting/docker>), then apply this repository's schema:

```bash
npx supabase db push --db-url "postgresql://postgres:<password>@<host>:5432/postgres"
```

On a self-hosted stack the university is responsible for what Supabase cloud otherwise provides: backups,
point-in-time recovery, Postgres upgrades, TLS and monitoring. See `docs/RUNBOOK.md`.

## Local development with Docker

`docker-compose.yml` runs the app image against the Supabase stack started by `npx supabase start`
(the CLI runs Postgres, Auth, Storage, REST and Realtime as Docker containers from
`supabase/config.toml`). Keeping a copy of Supabase's ten-service compose file in this repository would
drift from upstream, so the CLI is the single source for the local stack.

```bash
npx supabase start
docker compose up --build   # http://localhost:3000
```
