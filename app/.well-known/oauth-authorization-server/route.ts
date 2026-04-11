/**
 * OAuth 2.0 authorization server metadata (RFC 8414) for MCP clients (e.g. Claude.ai).
 */
export async function GET() {
  return Response.json({
    issuer: "https://memory-machine-v3.vercel.app",
    authorization_endpoint:
      "https://memory-machine-v3.vercel.app/api/oauth/authorize",
    token_endpoint: "https://memory-machine-v3.vercel.app/api/oauth/token",
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
  });
}
