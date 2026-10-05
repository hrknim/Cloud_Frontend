import { cloudResponse } from "@/lib/server/cloud";
import { manageFileLink } from "@/lib/server/public-links";
export const runtime = "nodejs";
export const GET = (request: Request) => cloudResponse(() => manageFileLink(request));
export const POST = GET;
export const DELETE = GET;
