/**
 * Minimal OAuth metadata for MCP clients (e.g. Claude.ai) — discovery only, no full OAuth server.
 */
export async function GET() {
  return Response.json({
    issuer: "https://memory-machine-v3.vercel.app",
    token_endpoint: "https://memory-machine-v3.vercel.app/api/mcp/token",
    response_types_supported: ["token"],
  });
}
