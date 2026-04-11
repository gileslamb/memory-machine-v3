import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

interface Env {
  MEMORY_MACHINE_API_KEY: string;
}

const BASE = "https://memory-machine-v3.vercel.app";

export class MemoryMachineMCP extends McpAgent<Env> {
  server = new McpServer({ name: "memory-machine", version: "3.0.0" });

  async init() {
    const key = this.env.MEMORY_MACHINE_API_KEY;
    const h = { "Content-Type": "application/json", "x-api-key": key };

    this.server.tool("list_projects", "Returns all active projects", {}, async () => {
      const res = await fetch(`${BASE}/api/projects`, { headers: h });
      return { content: [{ type: "text" as const, text: await res.text() }] };
    });

    this.server.tool("get_export", "Returns full markdown export", {}, async () => {
      const res = await fetch(`${BASE}/api/export`, { headers: h });
      return { content: [{ type: "text" as const, text: await res.text() }] };
    });

    this.server.tool(
      "create_log",
      "Creates a log entry",
      { content: z.string(), project_id: z.string().optional() },
      async ({ content, project_id }) => {
        const res = await fetch(`${BASE}/api/logs`, {
          method: "POST", headers: h,
          body: JSON.stringify({ content, project_id }),
        });
        return { content: [{ type: "text" as const, text: await res.text() }] };
      }
    );

    this.server.tool(
      "update_project_state",
      "Updates current_state for a project",
      { id: z.string(), current_state: z.string() },
      async ({ id, current_state }) => {
        const res = await fetch(`${BASE}/api/projects/${id}`, {
          method: "PATCH", headers: h,
          body: JSON.stringify({ current_state }),
        });
        return { content: [{ type: "text" as const, text: await res.text() }] };
      }
    );
  }
}

export default {
  fetch: MemoryMachineMCP.mount("/mcp"),
} as ExportedHandler<Env>;
