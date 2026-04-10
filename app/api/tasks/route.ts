import { NextRequest } from "next/server";
import { getSql } from "@/lib/db";
import { isAuthorized, unauthorizedResponse } from "@/lib/auth";
import { newId } from "@/lib/ids";

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return unauthorizedResponse();
  }
  const projectId = req.nextUrl.searchParams.get("project_id");
  if (!projectId?.trim()) {
    return Response.json({ error: "project_id is required" }, { status: 400 });
  }
  try {
    const sql = getSql();
    const rows = await sql`
      SELECT id, project_id, title, status, reminders_id, created_at, updated_at
      FROM tasks
      WHERE project_id = ${projectId.trim()}
      ORDER BY created_at DESC
    `;
    return Response.json(rows);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load tasks";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return unauthorizedResponse();
  }
  try {
    const body = (await req.json()) as { project_id?: string; title?: string };
    const project_id = body.project_id?.trim();
    const title = body.title?.trim();
    if (!project_id || !title) {
      return Response.json(
        { error: "project_id and title are required" },
        { status: 400 }
      );
    }
    const sql = getSql();
    const id = newId();
    const [row] = await sql`
      INSERT INTO tasks (id, project_id, title, status)
      VALUES (${id}, ${project_id}, ${title}, 'open')
      RETURNING id, project_id, title, status, reminders_id, created_at, updated_at
    `;
    return Response.json(row);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create task";
    return Response.json({ error: message }, { status: 500 });
  }
}
