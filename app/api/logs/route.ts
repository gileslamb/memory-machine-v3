import { NextRequest } from "next/server";
import { getSql } from "@/lib/db";
import { isAuthorized, unauthorizedResponse } from "@/lib/auth";
import { newId } from "@/lib/ids";
import { extractProjectState } from "@/lib/claude";

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return unauthorizedResponse();
  }
  try {
    const projectId = req.nextUrl.searchParams.get("project_id");
    const sql = getSql();
    const rows = projectId
      ? await sql`
          SELECT id, content, project_id, created_at
          FROM logs
          WHERE project_id = ${projectId}
          ORDER BY created_at DESC
        `
      : await sql`
          SELECT id, content, project_id, created_at
          FROM logs
          ORDER BY created_at DESC
        `;
    return Response.json(rows);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load logs";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return unauthorizedResponse();
  }
  try {
    const body = (await req.json()) as { content?: string; project_id?: string };
    const content = body.content?.trim();
    if (!content) {
      return Response.json({ error: "content is required" }, { status: 400 });
    }
    const project_id = body.project_id?.trim() || null;
    const sql = getSql();
    const id = newId();

    let projectRow: { name: string; current_state: string | null } | null = null;
    if (project_id) {
      const proj = await sql`
        SELECT name, current_state FROM projects WHERE id = ${project_id}
      `;
      if (!proj.length) {
        return Response.json({ error: "project not found" }, { status: 400 });
      }
      projectRow = proj[0] as { name: string; current_state: string | null };
    }

    const [log] = await sql`
      INSERT INTO logs (id, content, project_id)
      VALUES (${id}, ${content}, ${project_id})
      RETURNING id, content, project_id, created_at
    `;

    if (project_id && projectRow) {
      const p = projectRow;
      try {
        const updatedState = await extractProjectState({
          projectName: p.name,
          currentState: p.current_state,
          logContent: content,
        });
        await sql`
          UPDATE projects
          SET current_state = ${updatedState}, updated_at = NOW()
          WHERE id = ${project_id}
        `;
      } catch (err) {
        const claude_error = err instanceof Error ? err.message : "Claude failed";
        return Response.json({ ...log, claude_error });
      }
    }

    return Response.json(log);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create log";
    return Response.json({ error: message }, { status: 500 });
  }
}
