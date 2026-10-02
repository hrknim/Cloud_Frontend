import { readFile } from "node:fs/promises";
import ts from "typescript";

// Compile the production modules in memory for integration testing without a Next dev server.
async function compile(relative, replacements = {}, exposePool = false) {
  let source = await readFile(new URL(relative, import.meta.url), "utf8");
  if (exposePool) source = source.replace("const pool =", "export const pool =");
  let { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  outputText = outputText.replace(/from (["'])([^"']+)\1/g, (_match, _quote, specifier) => `from ${JSON.stringify(replacements[specifier] || import.meta.resolve(specifier))}`);
  return `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`;
}

export async function loadCloud() {
  const originUrl = await compile("../lib/request-origin.ts");
  const authUrl = await compile("../lib/auth-proxy.ts", { "./request-origin": originUrl });
  const prismaUrl = await compile("../lib/prisma.ts", {}, true);
  const errorUrl = await compile("../lib/cloud-error.ts");
  const recipientUrl = await compile("../lib/share-recipient.ts", { "./cloud-error": errorUrl });
  const cloudUrl = await compile("../lib/cloud.ts", { "./cloud-error": errorUrl, "./share-recipient": recipientUrl, "./prisma": prismaUrl, "./auth-proxy": authUrl, "./request-origin": originUrl });
  return { cloud: await import(cloudUrl), db: await import(prismaUrl) };
}

export async function loadAuthProxy() {
  const originUrl = await compile("../lib/request-origin.ts");
  return import(await compile("../lib/auth-proxy.ts", { "./request-origin": originUrl }));
}

export async function loadShareRecipient() {
  const errorUrl = await compile("../lib/cloud-error.ts");
  return import(await compile("../lib/share-recipient.ts", { "./cloud-error": errorUrl }));
}
