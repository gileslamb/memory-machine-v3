import { NextRequest } from "next/server";
import { getSql } from "@/lib/db";
import { isAuthorized, unauthorizedResponse } from "@/lib/auth";

type Params = { params: { id: string } };

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
