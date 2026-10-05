import { proxyAuthRequest } from "./auth-proxy";
import { CloudError } from "./cloud-error";

export function loginDestination(request: Request) {
  try {
    const base = new URL(process.env.AUTH_URL || "");
    if (!["http:", "https:"].includes(base.protocol) || base.username || base.password || base.origin === new URL(request.url).origin) throw new Error();
    return new URL("/login", base).href;
  } catch {
    throw new CloudError(503, "AUTH_URL_INVALID", "인증 서버 주소 설정을 확인해 주세요.");
  }
}

// Page navigation uses the same central session validation as the API, not
// cookie presence or the client-side user cache. Never read the auth DB here.
export async function rootDestination(request: Request, fetcher: typeof fetch = fetch) {
  const response = await proxyAuthRequest(request, "/api/user", fetcher);
  if (response.status === 401 || response.status === 403) return loginDestination(request);
  const data = await response.json();
  if (!response.ok) throw new CloudError(response.status, data?.error?.code || "AUTH_UNAVAILABLE", data?.error?.message || "인증 서버에 연결할 수 없습니다.");
  if (data === null || data?.result === null) return loginDestination(request);
  const id = data?.result?.id;
  if (typeof id !== "string" || !id.trim() || id.length > 255) throw new CloudError(502, "INVALID_AUTH_RESPONSE", "인증 서버의 사용자 정보가 올바르지 않습니다.");
  return "/drive";
}

export function pageAuthRequest(headerList: Headers) {
  try {
    const protocol = headerList.get("x-forwarded-proto") === "https" ? "https" : "http";
    const host = headerList.get("x-forwarded-host") || headerList.get("host") || "localhost";
    const base = new URL(process.env.WEB_URL || `${protocol}://${host}`);
    if (!["http:", "https:"].includes(base.protocol) || base.username || base.password) throw new Error();
    return new Request(new URL("/", base), { headers: { Cookie: headerList.get("cookie") || "" } });
  } catch {
    throw new CloudError(503, "WEB_URL_INVALID", "Cloud 서비스 주소 설정을 확인해 주세요.");
  }
}
