import { cloudResponse, downloadCloudFiles } from "@/lib/server/cloud";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = (request: Request) => cloudResponse(() => downloadCloudFiles(request));
