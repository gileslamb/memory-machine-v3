import { NextRequest } from "next/server";
import { getSql } from "@/lib/db";
import { isAuthorized, unauthorizedResponse } from "@/lib/auth";
import { fetchLogsWithProjects } from "@/lib/logsWithProjects";
import { insertLogEntry } from "@/lib/logMutations";

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return unauthorizedResponse();
  }
  try {
    const projectId = req.nextUrl.searchParams.get("project_id");
    const sql = getSql();
    const all = await fetchLogsWithProjects(sql);
    const rows = projectId
      ? all.filter(
          (l) =>
            l.project_id === projectId ||
            l.projects.some((p) => p.id === projectId)
        )
      : all;
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
    const body = (await req.json()) as {
      content?: string;
      project_id?: string;
      project_ids?: string[];
    };
    const content = body.content?.trim();
    if (!content) {
      return Response.json({ error: "content is required" }, { status: 400 });
    }
    const rawIds =
      body.project_ids?.map((x) => String(x).trim()).filter(Boolean) ?? [];
    if (rawIds.length === 0 && body.project_id?.trim()) {
      rawIds.push(body.project_id.trim());
    }

    try {
      const { log, claude_error } = await insertLogEntry(content, rawIds);
      if (claude_error) {
        return Response.json({ ...log, claude_error });
      }
      return Response.json(log);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create log";
      if (msg.startsWith("project not found")) {
        return Response.json({ error: msg }, { status: 400 });
      }
      throw err;
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create log";
    return Response.json({ error: message }, { status: 500 });
  }
}
