import { cloudResponse } from "@/lib/server/cloud";
import { driveStorage } from "@/lib/server/drive-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = (request: Request) => cloudResponse(() => driveStorage(request));
