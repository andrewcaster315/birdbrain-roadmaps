# Roadmaps

*A [Birdbrain Tools](https://birdbrain.tools) project.*

A focused, single-page roadmapping tool for product teams. Built for cross-team rollups: every team owns its own roadmap, and directors (or other PMs) can subscribe to peer roadmaps and reorder shared items locally without affecting the source.

**Live demo:** [birdbrain.tools](https://birdbrain.tools)

**Status:** Maintained as a side project on weekends. No SLA, no warranty, may change or disappear with little notice. Don't store anything you can't afford to lose.

## What it does

- **Timeline view** at week, month, or quarter granularity. Drag bars to move; drag edges to resize.
- **Swimlanes** so each roadmap can group its items by theme, owner, or workstream.
- **Share & subscribe** — place an item on another roadmap, or subscribe a roadmap to pull items from peer teams.
- **Dual priority** — the source team owns the master ranking; each roadmap orders its own view independently.
- **Important dates** — labeled vertical lines for launches, freezes, reviews, board meetings.
- **Magic-link auth** with optional company-domain allowlist. No passwords to rotate.
- **Audit log** of every change, viewable per-item and globally.

## Stack

- React + TypeScript + Vite
- CSS Modules
- Supabase (Postgres + Auth + Resend SMTP)
- Cloudflare Workers (static asset hosting)

## Run locally

You'll need Node 18+ and npm.

```bash
npm install
cp .env.example .env
npm run dev
```

The app boots in "mock mode" by default — data lives in `localStorage` with a seeded demo dataset, no backend required. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env` to point it at a real Supabase project.

## Self-host

The `supabase/migrations/` folder contains the SQL to bootstrap a Supabase project (schema, RLS, auth trigger, audit log, allowlist enforcement). Apply migrations in order, enable magic-link auth in the Supabase dashboard, and deploy the static build (`npm run build` → `dist/`) to any static host. The live demo runs on Cloudflare Workers with static assets; Vercel, Netlify, and S3+CloudFront work the same way.

## Contributing

This is a side project I maintain on weekends. Issues are welcome but response time is best-effort. I'm not actively soliciting pull requests — feel free to fork.

## License

[MIT](./LICENSE) — do what you want with it, just keep the copyright notice. No warranty.
