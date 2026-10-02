import { addItemShare, changeItemShare, cloudResponse, listItemShares } from "@/lib/cloud";
export const runtime = "nodejs";
export const GET = (request: Request) => cloudResponse(() => listItemShares(request));
export const POST = (request: Request) => cloudResponse(() => addItemShare(request));
export const PATCH = (request: Request) => cloudResponse(() => changeItemShare(request));
export const DELETE = (request: Request) => cloudResponse(() => changeItemShare(request));
