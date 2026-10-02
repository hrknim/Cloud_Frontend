import assert from "node:assert/strict";
import test from "node:test";
import { loadAuthProxy } from "./load-cloud.mjs";

const { proxyAuthRequest } = await loadAuthProxy();

test("auth proxy forwards only session_id, handles failures, and guards logout", async () => {
  const original = process.env.AUTH_URL;
  process.env.AUTH_URL = "https://auth.example.test";
  const request = (cookie, method = "GET", extra = {}) => new Request(`http://localhost:3001/api/${method === "POST" ? "logout" : "user"}`, {
    method, headers: { ...(cookie ? { Cookie: cookie } : {}), ...extra },
  });
  try {
    const noSession = await proxyAuthRequest(request(null), "/api/user", () => { throw new Error("Must not contact auth without a cookie"); });
    assert.equal(noSession.status, 401);
    assert.equal((await noSession.json()).error.code, "NO_SESSION");
    const success = await proxyAuthRequest(request("other=private; session_id=test-session; another=secret"), "/api/user", async (url, options) => {
      assert.equal(url.href, "https://auth.example.test/api/user");
      assert.equal(options.headers.Cookie, "session_id=test-session");
      assert.equal(options.cache, "no-store");
      assert.equal(options.redirect, "manual");
      return Response.json({ result: { id: "test-user" } });
    });
    assert.equal(success.status, 200);
    assert.equal((await success.json()).result.id, "test-user");
    assert.equal(success.headers.get("cache-control"), "private, no-store");
    const expired = await proxyAuthRequest(request("session_id=expired"), "/api/user", async () => new Response(null, { status: 401 }));
    assert.equal(expired.status, 401);
    const redirected = await proxyAuthRequest(request("session_id=test"), "/api/user", async () => new Response(null, { status: 302 }));
    assert.equal(redirected.status, 502);
    const unavailable = await proxyAuthRequest(request("session_id=test"), "/api/user", async () => { throw new Error("Network unavailable"); });
    assert.equal(unavailable.status, 502);
    const blocked = await proxyAuthRequest(request("session_id=test", "POST", { Origin: "https://other.example" }), "/api/logout", () => { throw new Error("Must not contact auth"); });
    assert.equal(blocked.status, 403);
    const logout = await proxyAuthRequest(request("session_id=test", "POST", { Origin: "http://localhost:3001" }), "/api/logout", async (_url, options) => {
      assert.equal(options.method, "POST");
      return new Response(null, { status: 204 });
    });
    assert.equal(logout.status, 200);
    assert.match(logout.headers.get("set-cookie"), /session_id=; Path=\/; Max-Age=0/);
    process.env.AUTH_URL = "auth.example.test:3000";
    const invalid = await proxyAuthRequest(request("session_id=test"), "/api/user");
    assert.equal(invalid.status, 503);
    assert.equal((await invalid.json()).error.code, "AUTH_URL_INVALID");
  } finally {
    if (original === undefined) delete process.env.AUTH_URL;
    else process.env.AUTH_URL = original;
  }
});
