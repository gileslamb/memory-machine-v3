# Memory Machine v3

Personal project management and context: logs, projects (with Claude-updated state), timesheet, stable context, weekly archives. Next.js 14, Neon Postgres, password gate + optional API key.

## Setup

```bash
npm install
npm run dev
```

Create `.env.local` with `DATABASE_URL`, `MEMORY_MACHINE_PASSWORD`, and the other vars from the project spec when developing locally.

Open http://localhost:3000 — unlock with `MEMORY_MACHINE_PASSWORD`, then run **Help → Initialize database** once.

## Stack

- Next.js (app router), TypeScript, inline styles
- Neon (`@neondatabase/serverless`), raw SQL
- Vercel deploy; env: `DATABASE_URL`, `MEMORY_MACHINE_PASSWORD`, `MEMORY_MACHINE_API_KEY`, `ANTHROPIC_API_KEY`
