import assert from "node:assert/strict";
import test from "node:test";
import { loadUserProfile } from "./load-cloud.mjs";

test("UUID profiles use the central API, filter fields, refresh and deduplicate", async () => {
  const { resolveUserProfile, resolveUserProfiles } = await loadUserProfile();
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.AUTH_URL;
  process.env.AUTH_URL = "http://localhost:3002";
  const request = new Request("http://localhost:3001/api/shared", { headers: { Cookie: "private=secret; session_id=test; locale=ko" } });
  const calls = [];
  let displayName = "Owner";
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(String(url), "http://localhost:3002/api/user/uuid");
      assert.equal(options.method, "POST");
      assert.equal(options.headers.Cookie, "session_id=test");
      assert.equal(options.cache, "no-store");
      assert.equal(options.redirect, "manual");
      calls.push(JSON.parse(options.body));
      return Response.json({ result: { handle: "owner", displayName, role: "ADMIN", bio: "Public", avatarUrl: "image" } });
    };
    const profiles = await resolveUserProfiles(request, ["uuid-a", "uuid-a", "uuid-b"]);
    assert.deepEqual(calls, [{ uuid: "uuid-a" }, { uuid: "uuid-b" }]);
    assert.deepEqual(profiles.get("uuid-a"), { handle: "owner", displayName: "Owner" });
    displayName = "New name";
    assert.deepEqual(await resolveUserProfile(request, "uuid-a"), { handle: "owner", displayName: "New name" });
    globalThis.fetch = async () => Response.json({ result: { handle: "", displayName: "Invalid" } });
    await assert.rejects(() => resolveUserProfile(request, "uuid-a"), error => error.code === "INVALID_AUTH_RESPONSE");
    globalThis.fetch = async () => Response.json({ error: "missing" }, { status: 401 });
    await assert.rejects(() => resolveUserProfile(request, "uuid-a"), error => error.code === "USER_LOOKUP_FAILED");
    globalThis.fetch = async () => { throw new Error("network"); };
    assert.equal((await resolveUserProfiles(request, ["uuid-a"])).get("uuid-a"), null);
    process.env.AUTH_URL = "invalid";
    await assert.rejects(() => resolveUserProfile(request, "uuid-a"), error => error.code === "AUTH_URL_INVALID");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.AUTH_URL; else process.env.AUTH_URL = originalUrl;
  }
});
