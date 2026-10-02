import { cloudResponse, listCloudItems, uploadCloudFile } from "@/lib/cloud";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = (request: Request) => cloudResponse(() => listCloudItems(request, "FILE"));
export const POST = (request: Request) => cloudResponse(() => uploadCloudFile(request));
