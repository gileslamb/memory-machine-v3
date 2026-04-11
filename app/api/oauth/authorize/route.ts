import { randomUUID } from "crypto";
import { NextRequest } from "next/server";

declare global {
  var __mmOAuthCodes:
    | Map<
        string,
        { challenge: string; method: string; expiry: number }
      >
    | undefined;
}

const BG = "#0a0a0f";
const ACCENT = "#7ee8a2";
const TEXT = "#e8e8ec";
const MUTED = "#8a8a95";

function getCodes() {
  if (!globalThis.__mmOAuthCodes) {
    globalThis.__mmOAuthCodes = new Map();
  }
  return globalThis.__mmOAuthCodes;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderPage(p: {
  client_id: string;
  redirect_uri: string;
  response_type: string;
  state: string;
  code_challenge: string;
  code_challenge_method: string;
  error?: string;
}): string {
  const errBlock =
    p.error ?
      `<p style="color:#ff8a8a;margin:0 0 16px;font-size:14px;">${escapeHtml(p.error)}</p>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Connect Claude — Memory Machine</title>
</head>
<body style="margin:0;background:${BG};color:${TEXT};font-family:system-ui,-apple-system,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;">
  <div style="width:100%;max-width:400px;background:#12121a;border:1px solid #1f1f2a;border-radius:12px;padding:28px 24px;">
    <h1 style="margin:0 0 8px;font-size:1.25rem;font-weight:600;">Memory Machine v3</h1>
    <p style="margin:0 0 20px;color:${MUTED};font-size:14px;line-height:1.5;">Sign in with your app password to connect <strong style="color:${ACCENT};">Claude</strong> as a remote MCP connector.</p>
    ${errBlock}
    <form method="post" action="/api/oauth/authorize" style="display:flex;flex-direction:column;gap:14px;">
      <input type="hidden" name="client_id" value="${escapeHtml(p.client_id)}" />
      <input type="hidden" name="redirect_uri" value="${escapeHtml(p.redirect_uri)}" />
      <input type="hidden" name="response_type" value="${escapeHtml(p.response_type)}" />
      <input type="hidden" name="state" value="${escapeHtml(p.state)}" />
      <input type="hidden" name="code_challenge" value="${escapeHtml(p.code_challenge)}" />
      <input type="hidden" name="code_challenge_method" value="${escapeHtml(p.code_challenge_method)}" />
      <label style="display:flex;flex-direction:column;gap:6px;font-size:14px;font-weight:600;">
        Password
        <input type="password" name="password" required autocomplete="current-password"
          style="min-height:48px;padding:12px 14px;border-radius:8px;border:1px solid #2a2a38;background:#0a0a12;color:${TEXT};font-size:16px;" />
      </label>
      <button type="submit" style="min-height:48px;margin-top:4px;padding:12px 18px;border:none;border-radius:8px;background:${ACCENT};color:#0a0a0f;font-size:16px;font-weight:600;cursor:pointer;">
        Connect
      </button>
    </form>
  </div>
</body>
</html>`;
}

function getOAuthParams(sp: URLSearchParams) {
  return {
    client_id: sp.get("client_id")?.trim() ?? "",
    redirect_uri: sp.get("redirect_uri")?.trim() ?? "",
    response_type: sp.get("response_type")?.trim() ?? "",
    state: sp.get("state")?.trim() ?? "",
    code_challenge: sp.get("code_challenge")?.trim() ?? "",
    code_challenge_method: sp.get("code_challenge_method")?.trim() ?? "",
  };
}

export async function GET(req: NextRequest) {
  const p = getOAuthParams(req.nextUrl.searchParams);
  if (
    !p.client_id ||
    !p.redirect_uri ||
    !p.response_type ||
    !p.state ||
    !p.code_challenge ||
    !p.code_challenge_method
  ) {
    return new Response("Missing OAuth parameters.", { status: 400 });
  }
  if (p.response_type !== "code") {
    return new Response("Unsupported response_type.", { status: 400 });
  }
  if (p.code_challenge_method !== "S256") {
    return new Response("Unsupported code_challenge_method.", { status: 400 });
  }
  try {
    const u = new URL(p.redirect_uri);
    if (u.protocol !== "https:" && u.protocol !== "http:") {
      return new Response("Invalid redirect_uri.", { status: 400 });
    }
  } catch {
    return new Response("Invalid redirect_uri.", { status: 400 });
  }

  return new Response(renderPage(p), {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return new Response("Invalid form.", { status: 400 });
  }

  const p = {
    client_id: String(form.get("client_id") ?? "").trim(),
    redirect_uri: String(form.get("redirect_uri") ?? "").trim(),
    response_type: String(form.get("response_type") ?? "").trim(),
    state: String(form.get("state") ?? "").trim(),
    code_challenge: String(form.get("code_challenge") ?? "").trim(),
    code_challenge_method: String(form.get("code_challenge_method") ?? "").trim(),
  };
  const password = String(form.get("password") ?? "");

  if (
    !p.client_id ||
    !p.redirect_uri ||
    !p.response_type ||
    !p.state ||
    !p.code_challenge ||
    !p.code_challenge_method
  ) {
    return new Response("Missing OAuth parameters.", { status: 400 });
  }

  const expected = process.env.MEMORY_MACHINE_PASSWORD ?? "";
  if (!expected) {
    return new Response(
      renderPage({ ...p, error: "Server misconfiguration (password not set)." }),
      { headers: { "content-type": "text/html; charset=utf-8" } }
    );
  }

  if (password !== expected) {
    return new Response(renderPage({ ...p, error: "Incorrect password." }), {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  if (p.response_type !== "code" || p.code_challenge_method !== "S256") {
    return new Response(renderPage({ ...p, error: "Invalid OAuth request." }), {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  let redirectUrl: URL;
  try {
    redirectUrl = new URL(p.redirect_uri);
  } catch {
    return new Response(renderPage({ ...p, error: "Invalid redirect_uri." }), {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  const code = randomUUID();
  const expiry = Date.now() + 10 * 60 * 1000;
  getCodes().set(code, {
    challenge: p.code_challenge,
    method: p.code_challenge_method,
    expiry,
  });

  redirectUrl.searchParams.set("code", code);
  redirectUrl.searchParams.set("state", p.state);
  return Response.redirect(redirectUrl.toString(), 302);
}
