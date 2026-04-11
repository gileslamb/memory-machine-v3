import { createHash, timingSafeEqual } from "crypto";
import { NextRequest } from "next/server";

declare global {
  var __mmOAuthCodes:
    | Map<
        string,
        { challenge: string; method: string; expiry: number }
      >
    | undefined;
}

function getCodes() {
  if (!globalThis.__mmOAuthCodes) {
    globalThis.__mmOAuthCodes = new Map();
  }
  return globalThis.__mmOAuthCodes;
}

function oauthError(status: number, error: string, description: string) {
  return Response.json({ error, error_description: description }, { status });
}

/** RFC 7636: BASE64URL(SHA256(ASCII code_verifier)) */
function pkceS256Challenge(verifier: string): string {
  const hash = createHash("sha256").update(verifier, "utf8").digest();
  return hash
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function parseBody(req: NextRequest): Promise<Record<string, string>> {
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    try {
      const j = (await req.json()) as Record<string, unknown>;
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(j)) {
        out[k] = v == null ? "" : String(v);
      }
      return out;
    } catch {
      return {};
    }
  }
  const text = await req.text();
  const params = new URLSearchParams(text);
  const out: Record<string, string> = {};
  params.forEach((v, k) => {
    out[k] = v;
  });
  return out;
}

export async function POST(req: NextRequest) {
  const fields = await parseBody(req);
  const grant_type = fields.grant_type?.trim() ?? "";
  const code = fields.code?.trim() ?? "";
  const redirect_uri = fields.redirect_uri?.trim() ?? "";
  const client_id = fields.client_id?.trim() ?? "";
  const code_verifier = fields.code_verifier?.trim() ?? "";

  if (grant_type !== "authorization_code") {
    return oauthError(400, "unsupported_grant_type", "grant_type must be authorization_code");
  }
  if (!code || !redirect_uri || !client_id || !code_verifier) {
    return oauthError(
      400,
      "invalid_request",
      "code, redirect_uri, client_id, and code_verifier are required"
    );
  }

  const apiKey = process.env.MEMORY_MACHINE_API_KEY ?? "";
  if (!apiKey.length) {
    return oauthError(503, "server_error", "API key not configured");
  }

  const codes = getCodes();
  const entry = codes.get(code);
  if (!entry || Date.now() > entry.expiry) {
    return oauthError(400, "invalid_grant", "Invalid or expired authorization code");
  }
  if (entry.method !== "S256") {
    return oauthError(400, "invalid_grant", "Unsupported code challenge method");
  }

  const computed = pkceS256Challenge(code_verifier);
  const a = Buffer.from(computed, "utf8");
  const b = Buffer.from(entry.challenge, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return oauthError(400, "invalid_grant", "PKCE verification failed");
  }

  codes.delete(code);

  return Response.json({
    access_token: apiKey,
    token_type: "bearer",
    expires_in: 7776000,
  });
}
