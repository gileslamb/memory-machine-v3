import { NextRequest } from "next/server";
import { getSql } from "@/lib/db";
import { isAuthorized, unauthorizedResponse } from "@/lib/auth";
import { newId } from "@/lib/ids";

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return unauthorizedResponse();
  }
  try {
    const sql = getSql();
    const rows = await sql`
      SELECT id, name, description, status, current_state, budget, status_v2, created_at, updated_at
      FROM projects
      ORDER BY updated_at DESC
    `;
    return Response.json(rows);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load projects";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return unauthorizedResponse();
  }
  try {
    const body = (await req.json()) as { name?: string; description?: string };
    const name = body.name?.trim();
    if (!name) {
      return Response.json({ error: "name is required" }, { status: 400 });
    }
    const description = body.description?.trim() ?? null;
    const id = newId();
    const sql = getSql();
    const [row] = await sql`
      INSERT INTO projects (id, name, description, status)
      VALUES (${id}, ${name}, ${description}, 'active')
      RETURNING id, name, description, status, current_state, budget, status_v2, created_at, updated_at
    `;
    return Response.json(row);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create project";
    return Response.json({ error: message }, { status: 500 });
  }
}
