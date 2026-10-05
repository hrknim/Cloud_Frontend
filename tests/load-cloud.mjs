import { readFile } from "node:fs/promises";
import ts from "typescript";

// Compile the production modules in memory for integration testing without a Next dev server.
async function compile(relative, replacements = {}, exposePool = false) {
  let source = await readFile(new URL(relative, import.meta.url), "utf8");
  if (exposePool) source = source.replace("const pool =", "export const pool =");
  let { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  outputText = outputText.replace(/from (["'])([^"']+)\1/g, (_match, _quote, specifier) => `from ${JSON.stringify(replacements[specifier] || replacements[specifier.replace("@/lib/", "../")] || import.meta.resolve(specifier))}`);
  return `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`;
}

export async function loadCloud() {
  const originUrl = await compile("../lib/server/request-origin.ts");
  const authUrl = await compile("../lib/server/auth-proxy.ts", { "./request-origin": originUrl });
  const prismaUrl = await compile("../lib/server/prisma.ts", {}, true);
  const errorUrl = await compile("../lib/server/cloud-error.ts");
  const recipientUrl = await compile("../lib/server/share-recipient.ts", { "./cloud-error": errorUrl });
  const profileUrl = await compile("../lib/server/user-profile.ts", { "./cloud-error": errorUrl });
  const fileTypesUrl = await compile("../lib/files/file-types.ts");
  const rangeUrl = await compile("../lib/files/http-range.ts");
  const downloadNamesUrl = await compile("../lib/files/download-names.ts");
  const downloadTreeUrl = await compile("../lib/files/download-tree.ts", { "./download-names": downloadNamesUrl });
  const responseStreamUrl = await compile("../lib/server/response-stream.ts");
  const quotaUrl = await compile("../lib/server/storage-quota.ts", { "./cloud-error": errorUrl });
  const cloudUrl = await compile("../lib/server/cloud.ts", { "./storage-quota": quotaUrl, "./response-stream": responseStreamUrl, "../files/download-tree": downloadTreeUrl, "../files/download-names": downloadNamesUrl, "../files/file-types": fileTypesUrl, "../files/http-range": rangeUrl, "./cloud-error": errorUrl, "./share-recipient": recipientUrl, "./user-profile": profileUrl, "./prisma": prismaUrl, "./auth-proxy": authUrl, "./request-origin": originUrl });
  const queryUrl = await compile("../lib/server/drive-query.ts", { "./cloud-error": errorUrl, "../files/file-types": fileTypesUrl });
  const apiUrl = await compile("../lib/drive/drive-api.ts", { "../files/file-types": fileTypesUrl });
  const navigationUrl = await compile("../lib/previews/preview-navigation.ts");
  const driveUrl = await compile("../lib/server/drive-server.ts", { "./storage-quota": quotaUrl, "./prisma": prismaUrl, "./cloud": cloudUrl, "./cloud-error": errorUrl, "./user-profile": profileUrl, "./drive-query": queryUrl, "../drive/drive-api": apiUrl, "../previews/preview-navigation": navigationUrl });
  const linksUrl = await compile("../lib/server/public-links.ts", { "./prisma": prismaUrl, "./cloud": cloudUrl, "./cloud-error": errorUrl });
  return { cloud: await import(cloudUrl), db: await import(prismaUrl), drive: await import(driveUrl), links: await import(linksUrl) };
}

export async function loadAuthProxy() {
  const originUrl = await compile("../lib/server/request-origin.ts");
  return import(await compile("../lib/server/auth-proxy.ts", { "./request-origin": originUrl }));
}

export async function loadShareRecipient() {
  const errorUrl = await compile("../lib/server/cloud-error.ts");
  return import(await compile("../lib/server/share-recipient.ts", { "./cloud-error": errorUrl }));
}

export async function loadUserProfile() {
  const errorUrl = await compile("../lib/server/cloud-error.ts");
  return import(await compile("../lib/server/user-profile.ts", { "./cloud-error": errorUrl }));
}
