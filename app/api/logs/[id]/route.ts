import { NextRequest } from "next/server";
import { getSql } from "@/lib/db";
import { isAuthorized, unauthorizedResponse } from "@/lib/auth";
import { fetchLogWithProjectsById } from "@/lib/logsWithProjects";
import { updateLogEntry } from "@/lib/logMutations";

type Params = { params: { id: string } };

export async function PATCH(req: NextRequest, context: Params) {
  if (!isAuthorized(req)) {
    return unauthorizedResponse();
  }
  const { id } = context.params;
  try {
    const body = (await req.json()) as {
      content?: string;
      project_ids?: string[];
    };
    if (body.content === undefined && body.project_ids === undefined) {
      return Response.json(
        { error: "content or project_ids required" },
        { status: 400 }
      );
    }
    if (body.content !== undefined && !String(body.content).trim()) {
      return Response.json({ error: "content cannot be empty" }, { status: 400 });
    }
    const sql = getSql();
    try {
      const row = await updateLogEntry(id, {
        content: body.content,
        projectIds: body.project_ids,
      });
      if (!row) {
        return Response.json({ error: "Not found" }, { status: 404 });
      }
      const enriched = await fetchLogWithProjectsById(sql, id);
      return Response.json(enriched ?? row);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Update failed";
      if (msg.startsWith("project not found")) {
        return Response.json({ error: msg }, { status: 400 });
      }
      throw err;
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to update log";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, context: Params) {
  if (!isAuthorized(req)) {
    return unauthorizedResponse();
  }
  const { id } = context.params;
  try {
    const sql = getSql();
    const deleted = await sql`
      DELETE FROM logs WHERE id = ${id}
      RETURNING id
    `;
    if (!deleted.length) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    return Response.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to delete log";
    return Response.json({ error: message }, { status: 500 });
  }
}
