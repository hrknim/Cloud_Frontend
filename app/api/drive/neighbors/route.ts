import { cloudResponse } from "@/lib/server/cloud";
import { drivePreviewNeighbors } from "@/lib/server/drive-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = (request: Request) => cloudResponse(() => drivePreviewNeighbors(request));
