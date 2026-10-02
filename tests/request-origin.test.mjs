import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../lib/request-origin.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { isAllowedMutationOrigin } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

test("mutation origins: public domains, exact ports, proxies, and foreign sites", () => {
  const original = process.env.WEB_URL;
  const request = headers => new Request("http://localhost:3001/api/files", { method: "POST", headers });
  try {
    delete process.env.WEB_URL;
    assert.equal(isAllowedMutationOrigin(request({ Origin: "http://web.example:3001", Host: "web.example:3001" })), true);
    assert.equal(isAllowedMutationOrigin(request({ Origin: "http://web.example:3002", Host: "web.example:3001" })), false);
    assert.equal(isAllowedMutationOrigin(request({ Origin: "http://localhost:3001", Host: "web.example:3001" })), false);
    assert.equal(isAllowedMutationOrigin(request({ Origin: "https://evil.example", Host: "web.example:3001", "X-Forwarded-Host": "evil.example" })), false);
    assert.equal(isAllowedMutationOrigin(request({ Origin: "http://localhost:3001" })), true);
    assert.equal(isAllowedMutationOrigin(request({ Origin: "null" })), false);
    assert.equal(isAllowedMutationOrigin(request({})), true);
    process.env.WEB_URL = "https://cloud.example:8443";
    assert.equal(isAllowedMutationOrigin(request({ Origin: "https://cloud.example:8443", Host: "localhost:3001" })), true);
    assert.equal(isAllowedMutationOrigin(request({ Origin: "https://cloud.example", Host: "localhost:3001" })), false);
    assert.equal(isAllowedMutationOrigin(request({ Origin: "https://cloud.example:8443", "Sec-Fetch-Site": "cross-site" })), false);
    process.env.WEB_URL = "not-a-url";
    assert.equal(isAllowedMutationOrigin(request({ Origin: "https://evil.example" })), false);
  } finally {
    if (original === undefined) delete process.env.WEB_URL;
    else process.env.WEB_URL = original;
  }
});
