import { cloudResponse, createCloudFolder, listCloudItems } from "@/lib/cloud";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = (request: Request) => cloudResponse(() => listCloudItems(request, "FOLDER"));
export const POST = (request: Request) => cloudResponse(() => createCloudFolder(request));
