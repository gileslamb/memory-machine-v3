import { NextRequest } from "next/server";

/**
 * Token shim: validates MEMORY_MACHINE_API_KEY so clients can obtain a bearer token for MCP.
 */
export async function POST(req: NextRequest) {
  let body: { api_key?: string };
  try {
    body = (await req.json()) as { api_key?: string };
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const apiKey = typeof body.api_key === "string" ? body.api_key.trim() : "";
  const expected = process.env.MEMORY_MACHINE_API_KEY ?? "";

  if (!expected.length) {
    return Response.json({ error: "API key not configured" }, { status: 503 });
  }
  if (!apiKey || apiKey !== expected) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  return Response.json({
    access_token: apiKey,
    token_type: "bearer",
  });
}
