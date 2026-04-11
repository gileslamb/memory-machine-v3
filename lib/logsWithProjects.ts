import { getSql } from "@/lib/db";

type Sql = ReturnType<typeof getSql>;

export type LogWithProjects = {
  id: string;
  content: string;
  project_id: string | null;
  created_at: string;
  projects: { id: string; name: string }[];
};

export async function fetchLogsWithProjects(sql: Sql): Promise<LogWithProjects[]> {
  const logs = await sql`
    SELECT id, content, project_id, created_at
    FROM logs
    ORDER BY created_at DESC
  `;
  const projRows = await sql`
    SELECT id, name FROM projects
  `;
  const nameById = new Map(
    (projRows as { id: string; name: string }[]).map((p) => [p.id, p.name])
  );
  const junc = await sql`
    SELECT lp.log_id, p.id, p.name
    FROM log_projects lp
    JOIN projects p ON p.id = lp.project_id
  `;
  const juncByLog = new Map<string, { id: string; name: string }[]>();
  for (const r of junc as { log_id: string; id: string; name: string }[]) {
    const arr = juncByLog.get(r.log_id) ?? [];
    arr.push({ id: r.id, name: r.name });
    juncByLog.set(r.log_id, arr);
  }
  return (logs as { id: string; content: string; project_id: string | null; created_at: string }[]).map(
    (l) => {
      const fromJ = juncByLog.get(l.id);
      let projects: { id: string; name: string }[];
      if (fromJ && fromJ.length > 0) {
        projects = fromJ;
      } else if (l.project_id) {
        projects = [
          {
            id: l.project_id,
            name: nameById.get(l.project_id) ?? l.project_id,
          },
        ];
      } else {
        projects = [];
      }
      return { ...l, projects };
    }
  );
}

export async function fetchLogWithProjectsById(
  sql: Sql,
  id: string
): Promise<LogWithProjects | null> {
  const rows = await fetchLogsWithProjects(sql);
  return rows.find((r) => r.id === id) ?? null;
}
