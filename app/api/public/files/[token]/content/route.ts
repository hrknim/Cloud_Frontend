import { downloadFileLink, publicLinkResponse } from "@/lib/server/public-links";
export const runtime = "nodejs";
export const GET = (request: Request, { params }: { params: Promise<{ token: string }> }) => publicLinkResponse(async () => downloadFileLink(request, (await params).token));
export const HEAD = GET;
