/**
 * Transparent HTTP proxy to Memory Machine's stateless MCP endpoint (`/api/mcp`).
 * Forwards GET / POST / OPTIONS and relevant headers so Anthropic / Claude.ai can use
 * a Cloudflare edge URL while tools run on the Vercel app.
 *
 * Optional: set secret MEMORY_MACHINE_API_KEY to inject `Authorization: Bearer …`
 * when the client does not send credentials (single-tenant deployments).
 */

export interface Env {
  UPSTREAM_BASE?: string;
  /** Optional; if set and the incoming request has no Authorization header, it is added. */
  MEMORY_MACHINE_API_KEY?: string;
}

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, x-api-key, x-memory-machine-api-key",
};

function withCors(res: Response): Response {
  const h = new Headers(res.headers);
  for (const [k, v] of Object.entries(CORS)) {
    h.set(k, v);
  }
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    const base =
      (env.UPSTREAM_BASE?.replace(/\/+$/, "") || "https://memory-machine-v3.vercel.app") +
      "/api/mcp";

    const src = new URL(request.url);
    const dest = new URL(base);
    dest.search = src.search;

    const headers = new Headers(request.headers);
    if (
      env.MEMORY_MACHINE_API_KEY &&
      !headers.get("Authorization") &&
      !headers.get("x-memory-machine-api-key") &&
      !headers.get("x-api-key")
    ) {
      headers.set("Authorization", `Bearer ${env.MEMORY_MACHINE_API_KEY}`);
    }

    const init: RequestInit = {
      method: request.method,
      headers,
      redirect: "manual",
    };

    if (request.method !== "GET" && request.method !== "HEAD") {
      init.body = request.body;
    }

    const upstream = await fetch(dest.toString(), init);
    return withCors(upstream);
  },
};
