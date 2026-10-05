import { CloudError } from "./cloud-error";

export type UserProfile = { handle: string; displayName: string };

export async function resolveUserProfile(request: Request, uuid: string): Promise<UserProfile> {
  let url: URL;
  try {
    url = new URL("/api/user/uuid", process.env.AUTH_URL);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.origin === new URL(request.url).origin) throw new Error();
  } catch { throw new CloudError(503, "AUTH_URL_INVALID", "인증 서버 주소 설정이 필요합니다."); }
  const cookie = request.headers.get("cookie")?.split(";").map(value => value.trim()).find(value => value.startsWith("session_id="));
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { Cookie: cookie || "", Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ uuid }), cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(8000),
    });
  } catch { throw new CloudError(502, "AUTH_UNAVAILABLE", "사용자 정보를 조회할 수 없습니다."); }
  if (!response.ok) throw new CloudError(502, "USER_LOOKUP_FAILED", "인증 서버에서 사용자 정보를 조회하지 못했습니다.");
  const data = await response.json().catch(() => null);
  const user = data?.result;
  if (!user || typeof user.handle !== "string" || !user.handle.trim() || user.handle.length > 255 ||
      typeof user.displayName !== "string" || !user.displayName.trim() || user.displayName.length > 255) {
    throw new CloudError(502, "INVALID_AUTH_RESPONSE", "인증 서버의 사용자 조회 응답이 올바르지 않습니다.");
  }
  // Account role, bio and other upstream fields never become Cloud authorization data.
  return { handle: user.handle, displayName: user.displayName };
}

// Deduplicate within this request only; refresh from the central server on every request.
export async function resolveUserProfiles(request: Request, uuids: string[]) {
  const ids = [...new Set(uuids)];
  const profiles = new Map<string, UserProfile | null>();
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(5, ids.length) }, async () => {
    while (index < ids.length) {
      const id = ids[index++];
      try { profiles.set(id, await resolveUserProfile(request, id)); }
      catch (error) {
        if (!(error instanceof CloudError)) throw error;
        // Profile failures must not hide otherwise accessible files or change permissions.
        profiles.set(id, null);
      }
    }
  }));
  return profiles;
}
