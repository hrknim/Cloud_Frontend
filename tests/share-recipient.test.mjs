import assert from "node:assert/strict";
import test from "node:test";
import { loadShareRecipient } from "./load-cloud.mjs";

test("Recipient lookup uses POST /api/user/handle and trusts only a validated server ID", async () => {
  const { resolveShareRecipient, resolveHandleProfile } = await loadShareRecipient();
  const fetcher = globalThis.fetch; const authUrl = process.env.AUTH_URL;
  process.env.AUTH_URL = "http://localhost:3002";
  const request = new Request("http://localhost:3001/api/shares", { method: "POST", headers: { Cookie: "private_cookie=secret; session_id=test-session; locale=ko" } });
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(String(url), "http://localhost:3002/api/user/handle"); assert.equal(options.method, "POST");
      assert.equal(options.headers.Cookie, "session_id=test-session"); assert.equal(options.headers["Content-Type"], "application/json");
      assert.deepEqual(JSON.parse(options.body), { handle: "cloud" });
      assert.equal(options.cache, "no-store"); assert.equal(options.redirect, "manual");
      return Response.json({ result: { id: "server-user-id", handle: "cloud", displayName: "Cloud", role: "USER", bio: "private", avatarUrl: null } });
    };
    assert.deepEqual(await resolveShareRecipient(request, " @cloud "), { id: "server-user-id", handle: "cloud", displayName: "Cloud" });
    assert.deepEqual(await resolveHandleProfile(request, "cloud"), { id: "server-user-id", handle: "cloud", displayName: "Cloud", bio: "private", avatarUrl: null });
    globalThis.fetch = async () => Response.json({ result: { id: "server-user-id", handle: "cloud", displayName: "Cloud", bio: "소개\n두 번째 줄", avatarUrl: "javascript:alert(1)", email: "hidden@example.test", role: "ADMIN" } });
    assert.deepEqual(await resolveHandleProfile(request, "cloud"), { id: "server-user-id", handle: "cloud", displayName: "Cloud", bio: "소개\n두 번째 줄", avatarUrl: null });
    globalThis.fetch = async () => Response.json({ result: { id: "server-user-id", handle: "cloud", displayName: "Cloud", avatarUrl: "/avatars/profile.png" } });
    assert.equal((await resolveHandleProfile(request, "cloud")).avatarUrl, "http://localhost:3002/avatars/profile.png");
    await assert.rejects(() => resolveShareRecipient(request, "@"), error => error.code === "INVALID_HANDLE");
    globalThis.fetch = async () => Response.json({ result: { id: "wrong-user", handle: "other", displayName: "Other" } });
    await assert.rejects(() => resolveShareRecipient(request, "cloud"), error => error.code === "INVALID_AUTH_RESPONSE");
    globalThis.fetch = async () => Response.json({ result: null });
    await assert.rejects(() => resolveShareRecipient(request, "cloud"), error => error.code === "USER_NOT_FOUND");
    globalThis.fetch = async () => Response.json({ error: "권한 없음" }, { status: 401 });
    await assert.rejects(() => resolveShareRecipient(request, "cloud"), error => error.code === "USER_LOOKUP_UNAUTHORIZED");
    globalThis.fetch = async () => { throw new Error("network unavailable"); };
    await assert.rejects(() => resolveShareRecipient(request, "cloud"), error => error.code === "AUTH_UNAVAILABLE");
  } finally {
    globalThis.fetch = fetcher;
    if (authUrl === undefined) delete process.env.AUTH_URL; else process.env.AUTH_URL = authUrl;
  }
});
