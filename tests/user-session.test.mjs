import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../lib/user-session.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { createUserSessionCache } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
const account = { id: "uuid", handle: "alice", displayName: "Alice" };

test("Concurrent initial loads and later remounts reuse one request and snapshot", async () => {
  let calls = 0, complete;
  const cache = createUserSessionCache((url, init) => {
    calls++; assert.equal(url, "/api/user"); assert.equal(init.credentials, "same-origin");
    return new Promise(resolve => { complete = resolve; });
  });
  const changes = [];
  const unsubscribe = cache.subscribe(() => changes.push(cache.getSnapshot()));
  const first = cache.load(), second = cache.load();
  assert.equal(first, second); assert.equal(calls, 1);
  complete(Response.json({ result: account })); await first;
  for (let i = 0; i < 5; i++) await cache.load();
  assert.equal(calls, 1); assert.deepEqual(cache.getSnapshot(), account);
  assert.equal(changes.length, 1);
  assert.equal(cache.getServerSnapshot(), null);
  unsubscribe(); cache.clear(); assert.equal(changes.length, 1);
  assert.equal(cache.getSnapshot(), null);
});

test("Logout clears all consumers and late requests cannot repopulate account data", async () => {
  let complete;
  const cache = createUserSessionCache(() => new Promise(resolve => { complete = resolve; }));
  const snapshots = [];
  cache.subscribe(() => snapshots.push(cache.getSnapshot()));
  const initial = cache.load();
  cache.clear(); complete(Response.json({ result: account })); await initial;
  assert.equal(cache.getSnapshot(), null);
  assert.deepEqual(snapshots, [null]);
  await cache.load(); assert.equal(cache.getSnapshot(), null);
});

test("Unauthorized, malformed and network failures do not expose stale user data", async () => {
  for (const response of [() => new Response(null, { status: 401 }), () => Response.json({ result: { displayName: {} } }), () => Promise.reject(new Error("offline"))]) {
    let calls = 0;
    const cache = createUserSessionCache(async () => { calls++; return response(); });
    await cache.load(); await cache.load();
    assert.equal(cache.getSnapshot(), null); assert.equal(calls, 1);
  }
});

test("Home subscribes to the header cache without starting an independent lookup", async () => {
  const home = await readFile(new URL("../components/drive/drive-home.tsx", import.meta.url), "utf8");
  const header = await readFile(new URL("../components/auth/userbar.tsx", import.meta.url), "utf8");
  assert.match(home, /useUserSession\(\)/);
  assert.doesNotMatch(home, /\/api\/user|userSession\.load|driveRequest/);
  assert.match(header, /userSession\.load\(\)/);
  assert.match(header, /userSession\.clear\(\)/);
});
