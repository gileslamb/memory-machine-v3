import { NextRequest } from "next/server";
import { getSql } from "@/lib/db";
import { isAuthorized, unauthorizedResponse } from "@/lib/auth";
import { newId } from "@/lib/ids";
import { parseDurationMinutes } from "@/lib/duration";

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return unauthorizedResponse();
  }
  try {
    const sql = getSql();
    const rows = await sql`
      SELECT t.id, t.project_id, t.duration_minutes, t.notes, t.logged_at,
             p.name AS project_name
      FROM timesheet t
      LEFT JOIN projects p ON p.id = t.project_id
      ORDER BY t.logged_at DESC
    `;
    return Response.json(rows);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load timesheet";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return unauthorizedResponse();
  }
  try {
    const body = (await req.json()) as {
      project_id?: string;
      duration_minutes?: number;
      duration?: string;
      notes?: string;
    };
    const project_id = body.project_id?.trim();
    if (!project_id) {
      return Response.json({ error: "project_id is required" }, { status: 400 });
    }

    let minutes: number | null =
      typeof body.duration_minutes === "number" ? body.duration_minutes : null;
    if (minutes === null && body.duration != null) {
      minutes = parseDurationMinutes(String(body.duration));
    }
    if (minutes === null || minutes <= 0) {
      return Response.json(
        { error: "Valid duration required (minutes, or e.g. 2h, 90m, 1.5 hours)" },
        { status: 400 }
      );
    }

    const sql = getSql();
    const proj = await sql`SELECT id FROM projects WHERE id = ${project_id}`;
    if (!proj.length) {
      return Response.json({ error: "project not found" }, { status: 400 });
    }

    const notes = body.notes?.trim() || null;
    const id = newId();
    const [row] = await sql`
      INSERT INTO timesheet (id, project_id, duration_minutes, notes)
      VALUES (${id}, ${project_id}, ${minutes}, ${notes})
      RETURNING id, project_id, duration_minutes, notes, logged_at
    `;
    return Response.json(row);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to log time";
    return Response.json({ error: message }, { status: 500 });
  }
}
