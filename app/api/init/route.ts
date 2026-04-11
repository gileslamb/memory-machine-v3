import { NextRequest } from "next/server";
import { getSql } from "@/lib/db";
import { isAuthorized, unauthorizedResponse } from "@/lib/auth";

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return unauthorizedResponse();
  }

  try {
    const sql = getSql();

    await sql`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'active',
        current_state TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS logs (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        project_id TEXT REFERENCES projects(id),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS timesheet (
        id TEXT PRIMARY KEY,
        project_id TEXT REFERENCES projects(id),
        duration_minutes INTEGER NOT NULL,
        notes TEXT,
        logged_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS stable_context (
        id TEXT PRIMARY KEY DEFAULT 'main',
        content TEXT NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS weekly_archive (
        id TEXT PRIMARY KEY,
        week_label TEXT NOT NULL,
        logs_snapshot TEXT NOT NULL,
        synthesis TEXT,
        archived_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    await sql`
      INSERT INTO stable_context (id, content)
      VALUES ('main', '')
      ON CONFLICT (id) DO NOTHING
    `;

    await sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS budget TEXT`;
    await sql`
      ALTER TABLE projects
      ADD COLUMN IF NOT EXISTS status_v2 TEXT DEFAULT 'pending'
    `;
    await sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS miro_url TEXT`;

    await sql`
      CREATE TABLE IF NOT EXISTS log_projects (
        id TEXT PRIMARY KEY,
        log_id TEXT NOT NULL REFERENCES logs(id) ON DELETE CASCADE,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        UNIQUE (log_id, project_id)
      )
    `;

    await sql`
      INSERT INTO log_projects (id, log_id, project_id)
      SELECT 'lp-' || l.id || '-' || l.project_id, l.id, l.project_id
      FROM logs l
      WHERE l.project_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM log_projects lp
          WHERE lp.log_id = l.id AND lp.project_id = l.project_id
        )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        project_id TEXT REFERENCES projects(id),
        title TEXT NOT NULL,
        status TEXT DEFAULT 'open',
        reminders_id TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    const seeds = [
      {
        id: "seed-dream-screens",
        name: "Dream Screens",
        description:
          "Transmedia concept album as browser experience. dreamscreens.io",
      },
      {
        id: "seed-signal-dreams",
        name: "Signal Dreams",
        description: "Live AV performance project. Modular synth + TouchDesigner",
      },
      {
        id: "seed-curious-dreamers",
        name: "Curious Dreamers",
        description: "Artist identity and general creative practice",
      },
      {
        id: "seed-commissions",
        name: "Commissions",
        description: "Client and commission work",
      },
      {
        id: "seed-life-admin",
        name: "Life Admin",
        description: "Personal admin and logistics",
      },
    ] as const;

    for (const p of seeds) {
      await sql`
        INSERT INTO projects (id, name, description, status)
        VALUES (${p.id}, ${p.name}, ${p.description}, 'active')
        ON CONFLICT (id) DO NOTHING
      `;
    }

    return Response.json({ ok: true, message: "Schema ready and seed applied." });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Init failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
