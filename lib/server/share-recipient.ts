import { CloudError } from "./cloud-error";

export async function resolveHandleProfile(request: Request, handle: unknown) {
  if (typeof handle !== "string" || !handle.trim() || handle.trim().length > 255) throw new CloudError(400, "INVALID_HANDLE", "공유할 사용자의 핸들을 입력하세요.");
  const cookie = request.headers.get("cookie")?.split(";").map(value => value.trim()).find(value => value.startsWith("session_id="));
  let url: URL;
  try {
    url = new URL("/api/user/handle", process.env.AUTH_URL);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.origin === new URL(request.url).origin) throw new Error();
  } catch { throw new CloudError(503, "AUTH_URL_INVALID", "인증 서버 주소 설정이 필요합니다."); }
  let response: Response;
  const normalizedHandle = handle.trim().replace(/^@/, "");
  if (!normalizedHandle) throw new CloudError(400, "INVALID_HANDLE", "공유할 사용자의 핸들을 입력하세요.");
  try { response = await fetch(url, { method: "POST", headers: { Cookie: cookie || "", Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify({ handle: normalizedHandle }), cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(8000) }); }
  catch { throw new CloudError(502, "AUTH_UNAVAILABLE", "사용자를 조회할 인증 서버에 연결할 수 없습니다."); }
  if (response.status === 401 || response.status === 403) throw new CloudError(401, "USER_LOOKUP_UNAUTHORIZED", "해당 사용자를 조회할 수 없습니다. 핸들과 인증 서버의 조회 권한을 확인해 주세요.");
  const data = await response.json().catch(() => null);
  if (response.status === 404) throw new CloudError(404, "USER_NOT_FOUND", "해당 핸들의 사용자를 찾을 수 없습니다. 인증 서버의 사용자 조회 API도 확인해 주세요.");
  if (!response.ok) throw new CloudError(502, "USER_LOOKUP_FAILED", "인증 서버에서 사용자를 조회하지 못했습니다.");
  const user = data?.result;
  if (user === null) throw new CloudError(404, "USER_NOT_FOUND", "해당 핸들의 사용자를 찾을 수 없습니다.");
  if (!user || typeof user.id !== "string" || !user.id.trim() || user.id.length > 255 || typeof user.handle !== "string" || user.handle.length > 255 || user.handle !== normalizedHandle || typeof user.displayName !== "string" || user.displayName.length > 255) {
    throw new CloudError(502, "INVALID_AUTH_RESPONSE", "인증 서버의 사용자 조회 응답이 올바르지 않습니다.");
  }
  let avatarUrl: string | null = null;
  if (typeof user.avatarUrl === "string" && user.avatarUrl.length <= 2048) {
    try {
      const imageUrl = new URL(user.avatarUrl, url);
      if (["http:", "https:"].includes(imageUrl.protocol) && !imageUrl.username && !imageUrl.password) avatarUrl = imageUrl.href;
    } catch { /* Invalid image URLs use the initial avatar. */ }
  }
  return { id: user.id as string, handle: user.handle as string, displayName: user.displayName as string,
    bio: typeof user.bio === "string" ? user.bio.slice(0, 2000) : null, avatarUrl };
}

export async function resolveShareRecipient(request: Request, handle: unknown) {
  const { id, handle: normalizedHandle, displayName } = await resolveHandleProfile(request, handle);
  return { id, handle: normalizedHandle, displayName };
}
