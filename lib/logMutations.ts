import { getSql } from "@/lib/db";
import { newId } from "@/lib/ids";
import { extractProjectState } from "@/lib/claude";

type Sql = ReturnType<typeof getSql>;

function dedupeIds(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    const t = id.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

export async function replaceLogProjects(
  sql: Sql,
  logId: string,
  projectIds: string[]
): Promise<void> {
  await sql`DELETE FROM log_projects WHERE log_id = ${logId}`;
  const seen = new Set<string>();
  for (const pid of projectIds) {
    if (!pid || seen.has(pid)) continue;
    seen.add(pid);
    await sql`
      INSERT INTO log_projects (id, log_id, project_id)
      VALUES (${newId()}, ${logId}, ${pid})
    `;
  }
}

export type CreatedLogRow = {
  id: string;
  content: string;
  project_id: string | null;
  created_at: string;
};

/**
 * Inserts a log, attaches projects in log_projects, runs Claude for the primary project (first id).
 */
export async function insertLogEntry(
  content: string,
  projectIdsIn: string[]
): Promise<{ log: CreatedLogRow; claude_error?: string }> {
  const sql = getSql();
  const projectIds = dedupeIds(projectIdsIn.filter(Boolean));
  const primary = projectIds[0] ?? null;

  for (const pid of projectIds) {
    const found = await sql`SELECT 1 FROM projects WHERE id = ${pid}`;
    if (!found.length) {
      throw new Error(`project not found: ${pid}`);
    }
  }

  let projectRow: { name: string; current_state: string | null } | null = null;
  if (primary) {
    const proj = await sql`
      SELECT name, current_state FROM projects WHERE id = ${primary}
    `;
    projectRow = proj[0] as { name: string; current_state: string | null };
  }

  const id = newId();
  const [log] = await sql`
    INSERT INTO logs (id, content, project_id)
    VALUES (${id}, ${content}, ${primary})
    RETURNING id, content, project_id, created_at
  `;

  await replaceLogProjects(sql, id, projectIds);

  if (primary && projectRow) {
    const p = projectRow;
    try {
      const extracted = await extractProjectState({
        projectName: p.name,
        currentState: p.current_state,
        logContent: content,
      });
      try {
        await sql`
          UPDATE projects
          SET current_state = ${extracted.state}, updated_at = NOW()
          WHERE id = ${primary}
        `;
      } catch {
        /* silent */
      }
      try {
        if (extracted.status != null) {
          await sql`
            UPDATE projects
            SET status_v2 = ${extracted.status}, updated_at = NOW()
            WHERE id = ${primary}
          `;
        }
      } catch {
        /* silent */
      }
      try {
        if (extracted.budget != null && extracted.budget !== "") {
          await sql`
            UPDATE projects
            SET budget = ${extracted.budget}, updated_at = NOW()
            WHERE id = ${primary}
          `;
        }
      } catch {
        /* silent */
      }
      for (const taskTitle of extracted.tasks) {
        const t = taskTitle.trim();
        if (!t) continue;
        try {
          const tid = newId();
          await sql`
            INSERT INTO tasks (id, project_id, title, status)
            VALUES (${tid}, ${primary}, ${t}, 'open')
          `;
        } catch {
          /* silent */
        }
      }
    } catch (err) {
      const claude_error =
        err instanceof Error ? err.message : "Claude failed";
      return { log: log as CreatedLogRow, claude_error };
    }
  }

  return { log: log as CreatedLogRow };
}

export async function updateLogEntry(
  logId: string,
  updates: { content?: string; projectIds?: string[] }
): Promise<CreatedLogRow | null> {
  const sql = getSql();
  const existing = await sql`
    SELECT id, content, project_id FROM logs WHERE id = ${logId}
  `;
  if (!existing.length) return null;
  const cur = existing[0] as {
    id: string;
    content: string;
    project_id: string | null;
  };

  const content =
    updates.content !== undefined ? updates.content.trim() : cur.content;
  let primary = cur.project_id;
  if (updates.projectIds !== undefined) {
    const ids = dedupeIds(updates.projectIds.filter(Boolean));
    for (const pid of ids) {
      const found = await sql`SELECT 1 FROM projects WHERE id = ${pid}`;
      if (!found.length) {
        throw new Error(`project not found: ${pid}`);
      }
    }
    primary = ids[0] ?? null;
    await replaceLogProjects(sql, logId, ids);
  }

  const [row] = await sql`
    UPDATE logs
    SET content = ${content}, project_id = ${primary}
    WHERE id = ${logId}
    RETURNING id, content, project_id, created_at
  `;
  return row as CreatedLogRow;
}
