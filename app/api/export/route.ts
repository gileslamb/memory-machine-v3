import { NextRequest } from "next/server";
import { getSql } from "@/lib/db";
import { isAuthorized, unauthorizedResponse } from "@/lib/auth";

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return unauthorizedResponse();
  }
  try {
    const sql = getSql();
    const [stable] = await sql`
      SELECT content FROM stable_context WHERE id = 'main'
    `;
    const stableContent =
      (stable as { content: string } | undefined)?.content ?? "";

    const logs = await sql`
      SELECT l.id, l.content, l.project_id, l.created_at, p.name AS project_name
      FROM logs l
      LEFT JOIN projects p ON p.id = l.project_id
      ORDER BY l.created_at DESC
    `;

    const projects = await sql`
      SELECT name, current_state, status
      FROM projects
      ORDER BY status ASC, name ASC
    `;

    let md = `# Memory Machine v3 export\n\n`;
    md += `## Stable context\n\n${stableContent || "_Empty._"}\n\n`;
    md += `## Current logs\n\n`;
    if (!logs.length) {
      md += `_No logs._\n\n`;
    } else {
      for (const row of logs as Array<{
        created_at: string;
        content: string;
        project_id: string | null;
        project_name: string | null;
      }>) {
        const t = new Date(row.created_at).toISOString();
        const tag =
          row.project_name || row.project_id
            ? ` _(project: ${row.project_name ?? row.project_id})_`
            : "";
        md += `### ${t}${tag}\n\n${row.content}\n\n`;
      }
    }
    md += `## Project current states\n\n`;
    for (const p of projects as Array<{
      name: string;
      current_state: string | null;
      status: string;
    }>) {
      const tag = p.status !== "active" ? ` _(${p.status})_` : "";
      md += `### ${p.name}${tag}\n\n${p.current_state?.trim() || "_No state yet._"}\n\n`;
    }

    return new Response(md, {
      headers: {
        "content-type": "text/plain; charset=utf-8",
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Export failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
