import { isAllowedMutationOrigin } from "./request-origin";

type AuthEndpoint = "/api/user" | "/api/logout";

function authError(status: number, code: string, message: string) {
  return Response.json({ result: null, error: { code, message } }, {
    status,
    headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
  });
}

// Forward only the session cookie, never other application cookies or credentials.
export async function proxyAuthRequest(request: Request, endpoint: AuthEndpoint, fetcher: typeof fetch = fetch) {
  const cookie = request.headers.get("cookie")?.split(";").map(value => value.trim()).find(value => value.startsWith("session_id="));
  if (!cookie || cookie === "session_id=") {
    return authError(401, "NO_SESSION", "session_id 쿠키가 없습니다.");
  }

  if (endpoint === "/api/logout") {
    if (!isAllowedMutationOrigin(request)) {
      return authError(403, "INVALID_ORIGIN", "다른 사이트의 로그아웃 요청은 허용되지 않습니다.");
    }
  }

  let target: URL;
  try {
    const base = new URL(process.env.AUTH_URL || "");
    if (!["http:", "https:"].includes(base.protocol) || !base.hostname || base.username || base.password) throw new Error("Invalid auth URL");
    target = new URL(endpoint, base);
    if (target.origin === new URL(request.url).origin) throw new Error("Auth proxy cannot target itself");
  } catch {
    return authError(503, "AUTH_URL_INVALID", "AUTH_URL을 http:// 또는 https://로 시작하는 인증 서버 주소로 설정하세요.");
  }

  try {
    const upstream = await fetcher(target, {
      method: endpoint === "/api/logout" ? "POST" : "GET",
      headers: { Cookie: cookie, Accept: "application/json", ...(endpoint === "/api/logout" ? { "Content-Type": "application/json" } : {}) },
      ...(endpoint === "/api/logout" ? { body: "{}" } : {}),
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
    });
    if (upstream.status === 401 || upstream.status === 403) return authError(upstream.status, "INVALID_SESSION", "세션이 만료되었거나 유효하지 않습니다.");
    if (!upstream.ok) return authError(502, "AUTH_UPSTREAM_ERROR", "인증 서버가 사용자 요청을 처리하지 못했습니다.");
    let data: unknown;
    if (upstream.status === 204 && endpoint === "/api/logout") data = { result: null };
    else {
      try { data = await upstream.json(); } catch { return authError(502, "INVALID_AUTH_RESPONSE", "인증 서버가 올바른 JSON 응답을 반환하지 않았습니다."); }
    }
    const response = Response.json(data, { headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
    // Preserve session renewal/expiry headers, including their original Domain/Path.
    for (const value of upstream.headers.getSetCookie()) response.headers.append("Set-Cookie", value);
    if (endpoint === "/api/logout") response.headers.append("Set-Cookie", "session_id=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax");
    return response;
  } catch {
    return authError(502, "AUTH_UNAVAILABLE", "인증 서버에 연결할 수 없습니다.");
  }
}
