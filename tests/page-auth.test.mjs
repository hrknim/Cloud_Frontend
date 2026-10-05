import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function compile(file, replacements = {}) {
  const {outputText} = ts.transpileModule(await readFile(new URL(file, import.meta.url), "utf8"), {
    compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022},
  });
  const source = outputText.replace(/from (["'])([^"']+)\1/g, (_match, _quote, specifier) => `from ${JSON.stringify(replacements[specifier] || import.meta.resolve(specifier))}`);
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}
const origin = await compile("../lib/server/request-origin.ts");
const proxy = await compile("../lib/server/auth-proxy.ts", {"./request-origin": origin});
const error = await compile("../lib/server/cloud-error.ts");
const {rootDestination, pageAuthRequest} = await import(await compile("../lib/server/page-auth.ts", {"./auth-proxy": proxy, "./cloud-error": error}));

test("Root page validates sessions centrally and separates expiry from service failures", async () => {
  const original = process.env.AUTH_URL;
  process.env.AUTH_URL = "https://auth.example.test/base/";
  const request = cookie => new Request("https://cloud.example.test/", {headers: cookie ? {Cookie: cookie} : {}});
  try {
    let calls = 0;
    const neverFetch = async () => {calls++; throw Error("must not fetch");};
    assert.equal(await rootDestination(request(), neverFetch), "https://auth.example.test/login");
    assert.equal(await rootDestination(request("session_id="), neverFetch), "https://auth.example.test/login");
    assert.equal(calls, 0);
    const valid = async (url, options) => {
      calls++;
      assert.equal(url.href, "https://auth.example.test/api/user");
      assert.equal(options.headers.Cookie, "session_id=valid");
      assert.equal(options.cache, "no-store");
      assert.equal(options.redirect, "manual");
      return Response.json({result: {id: "verified-user"}});
    };
    assert.equal(await rootDestination(request("other=secret; session_id=valid; locale=ko"), valid), "/drive");
    assert.equal(await rootDestination(request("session_id=valid"), valid), "/drive");
    assert.equal(calls, 2, "Session validation must not be shared across requests");
    for (const status of [401,403]) assert.equal(await rootDestination(request("session_id=expired"), async () => new Response(null, {status})), "https://auth.example.test/login");
    for (const result of [null, {result: null}]) assert.equal(await rootDestination(request("session_id=expired"), async () => Response.json(result)), "https://auth.example.test/login");
    await assert.rejects(rootDestination(request("session_id=valid"), async () => {throw Error("offline");}), {code: "AUTH_UNAVAILABLE"});
    await assert.rejects(rootDestination(request("session_id=valid"), async () => new Response(null, {status: 500})), {code: "AUTH_UPSTREAM_ERROR"});
    await assert.rejects(rootDestination(request("session_id=valid"), async () => new Response("not-json")), {code: "INVALID_AUTH_RESPONSE"});
    for (const value of [{}, {result: {}}, {result: {id: " "}}, {result: {id: 123}}]) await assert.rejects(rootDestination(request("session_id=valid"), async () => Response.json(value)), {code: "INVALID_AUTH_RESPONSE"});
    for (const url of ["", "auth.example.test", "javascript:alert(1)", "https://user:password@auth.example.test", "https://cloud.example.test"]) {
      process.env.AUTH_URL = url;
      await assert.rejects(rootDestination(request(), neverFetch), {code: "AUTH_URL_INVALID"});
    }
  } finally {
    if (original === undefined) delete process.env.AUTH_URL; else process.env.AUTH_URL = original;
  }
});

test("Home redirects outside its error handler and renders retry guidance on auth errors", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const url = text => `data:text/javascript;base64,${Buffer.from(text).toString("base64")}`;
  const shim = url(`
    import {CloudError} from ${JSON.stringify(error)};
    export const state = {fail:false};
    export const headers = async () => new Headers({host:"cloud.example.test"});
    export const pageAuthRequest = headerList => new Request("https://" + headerList.get("host"));
    export const rootDestination = async () => {if(state.fail) throw new CloudError(502,"AUTH_UNAVAILABLE","인증 서버에 연결할 수 없습니다."); return "/drive";};
    export const redirect = destination => {throw new Error("REDIRECT:" + destination);};
  `);
  const {state} = await import(shim);
  const {outputText} = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX}});
  const rewritten = outputText.replace(/from (["'])([^"']+)\1/g, (_match, _quote, name) => `from ${JSON.stringify(name === "@/lib/server/cloud-error" ? error : name === "react/jsx-runtime" ? import.meta.resolve(name) : shim)}`);
  const {default: Home} = await import(url(rewritten));
  await assert.rejects(Home(), {message: "REDIRECT:/drive"});
  state.fail = true;
  const page = await Home();
  assert.equal(page.type, "main");
  assert.equal(page.props.children[1].props.role, "alert");
  assert.equal(page.props.children[2].props.action, "/");
  assert.equal(page.props.children[2].props.method, "get");
});

test("Direct drive requests validate before rendering and never redirect to themselves", async () => {
  const source = (await readFile(new URL("../app/drive/page.tsx", import.meta.url), "utf8"))
    .replace('import styles from "@/components/drive/drive.module.css";', 'const styles={};');
  const url = text => `data:text/javascript;base64,${Buffer.from(text).toString("base64")}`;
  const shim = url(`
    import {CloudError} from ${JSON.stringify(error)};
    export const state = {destination:"/drive",fail:false,calls:[]};
    export const headers = async () => new Headers({host:"cloud.example.test"});
    export const pageAuthRequest = () => new Request("https://cloud.example.test/");
    export const rootDestination = async () => {state.calls.push("auth");if(state.fail) throw new CloudError(502,"AUTH_UNAVAILABLE","인증 서버에 연결할 수 없습니다.");return state.destination;};
    export const redirect = destination => {throw new Error("REDIRECT:" + destination);};
    export const GetCurrentLanguage = async () => {state.calls.push("language");return "ko";};
    export default function Component() {}
    export const DriveSearch = Component, DriveSearchProvider = Component;
  `);
  const {state} = await import(shim);
  const {outputText} = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX}});
  const rewritten = outputText.replace(/from (["'])([^"']+)\1/g, (_match, _quote, name) => `from ${JSON.stringify(name === "@/lib/server/cloud-error" ? error : name === "react/jsx-runtime" ? import.meta.resolve(name) : shim)}`);
  const {default: DrivePage} = await import(url(rewritten));
  const page = await DrivePage();
  assert.equal(typeof page.type, "function");
  assert.deepEqual(state.calls, ["auth", "language"]);
  state.calls.length = 0;
  state.destination = "https://auth.example.test/login";
  await assert.rejects(DrivePage(), {message: "REDIRECT:https://auth.example.test/login"});
  assert.deepEqual(state.calls, ["auth"]);
  state.calls.length = 0;
  state.fail = true;
  const failure = await DrivePage();
  assert.equal(failure.type, "main");
  assert.equal(failure.props.children[1].props.role, "alert");
  assert.equal(failure.props.children[2].props.action, "/drive");
  assert.deepEqual(state.calls, ["auth"]);
});

test("Page request uses the configured Cloud address and forwards only cookies", () => {
  const original = process.env.WEB_URL;
  try {
    delete process.env.WEB_URL;
    const headerList = new Headers({host: "localhost:25565", cookie: "session_id=test", authorization: "secret"});
    assert.equal(pageAuthRequest(headerList).url, "http://localhost:25565/");
    headerList.set("x-forwarded-host", "cloud.example.test"); headerList.set("x-forwarded-proto", "https");
    assert.equal(pageAuthRequest(headerList).url, "https://cloud.example.test/");
    process.env.WEB_URL = "https://configured.example.test:3001";
    const request = pageAuthRequest(headerList);
    assert.equal(request.url, "https://configured.example.test:3001/");
    assert.equal(request.headers.get("cookie"), "session_id=test");
    assert.equal(request.headers.get("authorization"), null);
    process.env.WEB_URL = "not-a-url";
    assert.throws(() => pageAuthRequest(headerList), {code: "WEB_URL_INVALID"});
  } finally {
    if (original === undefined) delete process.env.WEB_URL; else process.env.WEB_URL = original;
  }
});
