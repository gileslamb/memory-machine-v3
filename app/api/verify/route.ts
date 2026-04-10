import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { password?: string };
    const password = body.password ?? "";
    const expected = process.env.MEMORY_MACHINE_PASSWORD ?? "";
    if (!expected) {
      return Response.json(
        { ok: false, error: "Server is not configured with MEMORY_MACHINE_PASSWORD" },
        { status: 500 }
      );
    }
    const ok = password === expected;
    return Response.json({ ok });
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }
}
