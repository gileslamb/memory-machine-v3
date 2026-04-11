import { NextRequest } from "next/server";

export function getAuthToken(req: NextRequest | Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    return auth.slice(7).trim();
  }
  const headerKey = req.headers.get("x-memory-machine-api-key");
  if (headerKey) {
    return headerKey.trim();
  }
  const xApiKey = req.headers.get("x-api-key");
  if (xApiKey) {
    return xApiKey.trim();
  }
  return null;
}

export function isAuthorized(req: NextRequest | Request): boolean {
  const token = getAuthToken(req);
  if (!token) return false;
  const password = process.env.MEMORY_MACHINE_PASSWORD ?? "";
  const apiKey = process.env.MEMORY_MACHINE_API_KEY ?? "";
  return token === password || (apiKey.length > 0 && token === apiKey);
}

export function unauthorizedResponse() {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}
