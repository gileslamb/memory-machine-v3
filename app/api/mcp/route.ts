import { NextRequest } from "next/server";
import { isAuthorized } from "@/lib/auth";
import { getSql } from "@/lib/db";
import { buildExportMarkdown } from "@/lib/exportMarkdown";
import { insertLogEntry } from "@/lib/logMutations";

type JsonRpcReq = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
};

function rpcResponse(id: string | number | null | undefined, result: unknown) {
  return {
    jsonrpc: "2.0",
    id,
    result,
  };
}

function rpcError(
  id: string | number | null | undefined,
  code: number,
  message: string
) {
  return {
    jsonrpc: "2.0",
    id,
    error: { code, message },
  };
}

function toolText(text: string, isError = false) {
  return {
    content: [{ type: "text" as const, text }],
    isError,
  };
}

function mcpUnauthorizedResponse(): Response {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: {
      "Content-Type": "application/json",
      "WWW-Authenticate":
        `Bearer realm="Memory Machine", ` +
        `error="invalid_token", ` +
        `error_description="Authentication required"`,
      Link: `<https://memory-machine-v3.vercel.app/.well-known/oauth-authorization-server>; rel="oauth-server"`,
    },
  });
}

const TOOLS = [
  {
    name: "list_projects",
    description: "Returns all active projects (status = active).",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "get_project",
    description: "Returns one project by id, including current_state and miro_url.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "string", description: "Project id" },
      },
      required: ["id"],
    },
  },
  {
    name: "create_log",
    description:
      "Creates a log entry. Optional project_id runs Claude state extraction for that project.",
    inputSchema: {
      type: "object" as const,
      properties: {
        content: { type: "string" },
        project_id: { type: "string", description: "Optional primary project" },
      },
      required: ["content"],
    },
  },
  {
    name: "update_project_state",
    description: "Sets projects.current_state for a project id.",
    inputSchema: {
      type: "object" as const,
      properties: {
        id: { type: "string" },
        current_state: { type: "string" },
      },
      required: ["id", "current_state"],
    },
  },
  {
    name: "get_export",
    description: "Returns the full plain-text markdown export (same as GET /api/export).",
    inputSchema: { type: "object" as const, properties: {} },
  },
];

async function runTool(
  name: string,
  args: Record<string, unknown>
): Promise<{ content: { type: "text"; text: string }[]; isError: boolean }> {
  const sql = getSql();
  switch (name) {
    case "list_projects": {
      const rows = await sql`
        SELECT id, name, description, status, current_state, budget, status_v2, miro_url, created_at, updated_at
        FROM projects
        WHERE status = 'active'
        ORDER BY updated_at DESC
      `;
      return toolText(JSON.stringify(rows, null, 2));
    }
    case "get_project": {
      const idArg = typeof args.id === "string" ? args.id.trim() : "";
      if (!idArg) return toolText("Missing id", true);
      const rows = await sql`
        SELECT id, name, description, status, current_state, budget, status_v2, miro_url, created_at, updated_at
        FROM projects WHERE id = ${idArg}
      `;
      if (!rows.length) return toolText("Project not found", true);
      return toolText(JSON.stringify(rows[0], null, 2));
    }
    case "create_log": {
      const content = typeof args.content === "string" ? args.content.trim() : "";
      if (!content) return toolText("content is required", true);
      const project_id =
        typeof args.project_id === "string" && args.project_id.trim() ?
          [args.project_id.trim()]
        : [];
      try {
        const { log, claude_error } = await insertLogEntry(content, project_id);
        const payload = claude_error ? { ...log, claude_error } : log;
        return toolText(JSON.stringify(payload, null, 2), Boolean(claude_error));
      } catch (e) {
        const msg = e instanceof Error ? e.message : "create_log failed";
        return toolText(msg, true);
      }
    }
    case "update_project_state": {
      const pid = typeof args.id === "string" ? args.id.trim() : "";
      const current_state =
        typeof args.current_state === "string" ? args.current_state : "";
      if (!pid) return toolText("Missing id", true);
      const [row] = await sql`
        UPDATE projects
        SET current_state = ${current_state}, updated_at = NOW()
        WHERE id = ${pid}
        RETURNING id, name, current_state, updated_at
      `;
      if (!row) return toolText("Project not found", true);
      return toolText(JSON.stringify(row, null, 2));
    }
    case "get_export": {
      const md = await buildExportMarkdown();
      return toolText(md);
    }
    default:
      return toolText(`Unknown tool: ${name}`, true);
  }
}

export async function GET() {
  return Response.json({
    jsonrpc: "2.0",
    result: {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "memory-machine", version: "3.0.0" },
    },
  });
}

/**
 * Stateless HTTP MCP: single POST, JSON-RPC in → JSON-RPC out (no SSE, no sessions).
 *
 * `initialize`, `ping`, and `tools/list` work without credentials (handshake / discovery).
 * All other methods require
 * isAuthorized(): Bearer (password or API key), x-memory-machine-api-key, or x-api-key.
 */
export async function POST(req: NextRequest) {
  let body: JsonRpcReq;
  try {
    body = (await req.json()) as JsonRpcReq;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { id, method, params } = body;

  const allowUnauthenticated =
    method === "initialize" || method === "ping" || method === "tools/list";
  if (!allowUnauthenticated && !isAuthorized(req)) {
    return mcpUnauthorizedResponse();
  }

  if (method?.startsWith("notifications/")) {
    return new Response(null, { status: 200 });
  }

  if (method === "initialize") {
    return Response.json(
      rpcResponse(id, {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "memory-machine", version: "3.0.0" },
      })
    );
  }

  if (method === "tools/list") {
    return Response.json(rpcResponse(id, { tools: TOOLS }));
  }

  if (method === "tools/call") {
    const p = params as { name?: string; arguments?: Record<string, unknown> } | undefined;
    const toolName = p?.name ?? "";
    const toolArgs = p?.arguments ?? {};
    try {
      const result = await runTool(toolName, toolArgs);
      return Response.json(rpcResponse(id, result));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Tool failed";
      return Response.json(rpcResponse(id, toolText(msg, true)));
    }
  }

  if (method === "ping") {
    return Response.json(rpcResponse(id, {}));
  }

  return Response.json(
    rpcError(id ?? null, -32601, method ? `Method not found: ${method}` : "Missing method")
  );
}
