// Use the public Host for direct requests, and an explicit WEB_URL for reverse proxies.
// Do not accept arbitrary X-Forwarded-Host values as trusted application origins.
export function isAllowedMutationOrigin(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin) return true; // Non-browser API callers still require a verified session.

  const allowed = new Set<string>();
  const internal = new URL(request.url);
  const host = request.headers.get("host");
  if (host) {
    try {
      const publicUrl = new URL(`${internal.protocol}//${host}`);
      if (publicUrl.host.toLowerCase() === host.toLowerCase()) allowed.add(publicUrl.origin);
    } catch { /* Invalid Host cannot authorize an origin. */ }
  } else {
    allowed.add(internal.origin);
  }

  if (process.env.WEB_URL) {
    try {
      const configured = new URL(process.env.WEB_URL);
      if (["http:", "https:"].includes(configured.protocol) && !configured.username && !configured.password) allowed.add(configured.origin);
    } catch { /* Invalid settings do not broaden access. */ }
  }

  try {
    const parsed = new URL(origin);
    return parsed.origin === origin && allowed.has(parsed.origin);
  } catch { return false; }
}
