import { NextRequest } from "next/server";
import { isAuthorized, unauthorizedResponse } from "@/lib/auth";
import { buildExportMarkdown } from "@/lib/exportMarkdown";

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return unauthorizedResponse();
  }
  try {
    const md = await buildExportMarkdown();
    return new Response(md, {
      headers: {
        "content-type": "text/plain; charset=utf-8",
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Export failed";
    return Response.json({ error: message }, { status: 500 });
  }
}
