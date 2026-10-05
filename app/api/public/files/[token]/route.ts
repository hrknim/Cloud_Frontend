import { publicFileData, publicLinkResponse } from "@/lib/server/public-links";
export const runtime = "nodejs";
export const GET = (request: Request, { params }: { params: Promise<{ token: string }> }) => publicLinkResponse(async () => Response.json({ item: await publicFileData(request, (await params).token) }));
