import { NextRequest } from "next/server";
import { getSql } from "@/lib/db";
import { isAuthorized, unauthorizedResponse } from "@/lib/auth";

type Params = { params: { id: string } };

export async function PATCH(req: NextRequest, context: Params) {
  if (!isAuthorized(req)) {
    return unauthorizedResponse();
  }
  const { id } = context.params;
  try {
    const body = (await req.json()) as { status?: string; title?: string };
    const sql = getSql();
    const existing = await sql`
      SELECT id, project_id, title, status, reminders_id, created_at, updated_at
      FROM tasks WHERE id = ${id}
    `;
    if (!existing.length) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    const cur = existing[0] as {
      title: string;
      status: string;
    };
    const title = body.title !== undefined ? body.title.trim() : cur.title;
    const status = body.status !== undefined ? body.status.trim() : cur.status;
    if (!title) {
      return Response.json({ error: "title cannot be empty" }, { status: 400 });
    }
    const [row] = await sql`
      UPDATE tasks
      SET title = ${title}, status = ${status}, updated_at = NOW()
      WHERE id = ${id}
      RETURNING id, project_id, title, status, reminders_id, created_at, updated_at
    `;
    return Response.json(row);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to update task";
    return Response.json({ error: message }, { status: 500 });
  }
}
