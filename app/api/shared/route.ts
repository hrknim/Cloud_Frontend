import { cloudResponse, listSharedItems } from "@/lib/server/cloud";
export const runtime = "nodejs";
export const GET = (request: Request) => cloudResponse(() => listSharedItems(request));
