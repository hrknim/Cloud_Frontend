import { cloudResponse, downloadCloudFile } from "@/lib/server/cloud";

export const runtime = "nodejs";
export const GET = (request: Request, { params }: { params: Promise<{ id: string }> }) => cloudResponse(async () => downloadCloudFile(request, (await params).id));
