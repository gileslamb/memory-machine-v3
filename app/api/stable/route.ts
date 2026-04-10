import { NextRequest } from "next/server";
import { getSql } from "@/lib/db";
import { isAuthorized, unauthorizedResponse } from "@/lib/auth";

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return unauthorizedResponse();
  }
  try {
    const sql = getSql();
    const rows = await sql`
      SELECT id, content, updated_at FROM stable_context WHERE id = 'main'
    `;
    const row = rows[0] ?? { id: "main", content: "", updated_at: null };
    return Response.json(row);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load stable context";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return unauthorizedResponse();
  }
  try {
    const body = (await req.json()) as { content?: string };
    if (body.content === undefined) {
      return Response.json({ error: "content is required" }, { status: 400 });
    }
    const sql = getSql();
    const [row] = await sql`
      INSERT INTO stable_context (id, content, updated_at)
      VALUES ('main', ${body.content}, NOW())
      ON CONFLICT (id) DO UPDATE SET
        content = EXCLUDED.content,
        updated_at = NOW()
      RETURNING id, content, updated_at
    `;
    return Response.json(row);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to save stable context";
    return Response.json({ error: message }, { status: 500 });
  }
}
