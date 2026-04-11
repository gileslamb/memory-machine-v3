import { getSql } from "@/lib/db";
import { fetchLogsWithProjects } from "@/lib/logsWithProjects";

/** Plain-text markdown bundle for Context tab, MCP get_export, and GET /api/export. */
export async function buildExportMarkdown(): Promise<string> {
  const sql = getSql();
  const [stable] = await sql`
    SELECT content FROM stable_context WHERE id = 'main'
  `;
  const stableContent =
    (stable as { content: string } | undefined)?.content ?? "";

  const logs = await fetchLogsWithProjects(sql);

  const projects = await sql`
    SELECT name, current_state, status, miro_url
    FROM projects
    ORDER BY status ASC, name ASC
  `;

  let md = `# Memory Machine v3 export\n\n`;
  md += `## Stable context\n\n${stableContent || "_Empty._"}\n\n`;
  md += `## Current logs\n\n`;
  if (!logs.length) {
    md += `_No logs._\n\n`;
  } else {
    for (const row of logs) {
      const t = new Date(row.created_at).toISOString();
      let tag = "";
      if (row.projects.length > 0) {
        const names = row.projects.map((x) => x.name).join(", ");
        tag = ` _(projects: ${names})_`;
      }
      md += `### ${t}${tag}\n\n${row.content}\n\n`;
    }
  }
  md += `## Project current states\n\n`;
  for (const p of projects as Array<{
    name: string;
    current_state: string | null;
    status: string;
    miro_url: string | null;
  }>) {
    const tag = p.status !== "active" ? ` _(${p.status})_` : "";
    const miroLine =
      p.miro_url?.trim() ?
        `\n\nMiro: ${p.miro_url.trim()}`
      : "";
    md += `### ${p.name}${tag}\n\n${p.current_state?.trim() || "_No state yet._"}${miroLine}\n\n`;
  }

  return md;
}
