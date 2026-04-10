import { NextRequest } from "next/server";
import { getSql } from "@/lib/db";
import { isAuthorized, unauthorizedResponse } from "@/lib/auth";

const STATUS_V2 = new Set([
  "pending",
  "in-dev",
  "active",
  "delivered",
  "on-hold",
]);

type Params = { params: { id: string } };

export async function PATCH(req: NextRequest, context: Params) {
  if (!isAuthorized(req)) {
    return unauthorizedResponse();
  }
  const { id } = context.params;
  try {
    const body = (await req.json()) as {
      name?: string;
      description?: string;
      current_state?: string;
      status?: string;
      budget?: string | null;
      status_v2?: string;
    };
    const sql = getSql();
    const existing = await sql`
      SELECT id, name, description, status, current_state, budget, status_v2, created_at, updated_at
      FROM projects WHERE id = ${id}
    `;
    if (!existing.length) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    const cur = existing[0] as {
      name: string;
      description: string | null;
      status: string;
      current_state: string | null;
      budget: string | null;
      status_v2: string | null;
    };

    if (body.status !== undefined && !["active", "archived"].includes(body.status)) {
      return Response.json({ error: "status must be active or archived" }, { status: 400 });
    }
    if (body.status_v2 !== undefined && !STATUS_V2.has(body.status_v2)) {
      return Response.json({ error: "invalid status_v2" }, { status: 400 });
    }

    const name = body.name !== undefined ? body.name.trim() : cur.name;
    const description =
      body.description !== undefined ? body.description : cur.description;
    const current_state =
      body.current_state !== undefined ? body.current_state : cur.current_state;
    const status = body.status !== undefined ? body.status : cur.status;
    const budget =
      body.budget !== undefined
        ? body.budget === null || body.budget === ""
          ? null
          : body.budget
        : cur.budget;
    const status_v2 =
      body.status_v2 !== undefined ? body.status_v2 : cur.status_v2;

    const [row] = await sql`
      UPDATE projects
      SET
        name = ${name},
        description = ${description},
        current_state = ${current_state},
        status = ${status},
        budget = ${budget},
        status_v2 = ${status_v2},
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING id, name, description, status, current_state, budget, status_v2, created_at, updated_at
    `;
    return Response.json(row);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to update project";
    return Response.json({ error: message }, { status: 500 });
  }
}
