import { NextRequest } from "next/server";
import { getSql } from "@/lib/db";
import { isAuthorized, unauthorizedResponse } from "@/lib/auth";
import { newId } from "@/lib/ids";

function mondayStart(d: Date): Date {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function formatWeekLabel(now: Date): string {
  const start = mondayStart(now);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const opts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
  };
  const a = start.toLocaleDateString("en-GB", opts);
  const b = end.toLocaleDateString("en-GB", opts);
  return `Week of ${a} – ${b}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return unauthorizedResponse();
  }
  try {
    const sql = getSql();
    const rows = await sql`
      SELECT id, week_label, logs_snapshot, synthesis, archived_at
      FROM weekly_archive
      ORDER BY archived_at DESC
    `;
    return Response.json(rows);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load archives";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return unauthorizedResponse();
  }
  try {
    const sql = getSql();
    const logs = await sql`
      SELECT id, content, project_id, created_at
      FROM logs
      ORDER BY created_at ASC
    `;
    const week_label = formatWeekLabel(new Date());
    const logs_snapshot = JSON.stringify(logs, null, 2);
    const id = newId();
    const [archive] = await sql`
      INSERT INTO weekly_archive (id, week_label, logs_snapshot, synthesis)
      VALUES (${id}, ${week_label}, ${logs_snapshot}, NULL)
      RETURNING id, week_label, logs_snapshot, synthesis, archived_at
    `;
    await sql`DELETE FROM logs`;
    return Response.json(archive);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to archive";
    return Response.json({ error: message }, { status: 500 });
  }
}
