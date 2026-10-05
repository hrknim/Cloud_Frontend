import { cloudResponse } from "@/lib/server/cloud";
import { listDrivePage } from "@/lib/server/drive-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = (request: Request) => cloudResponse(() => listDrivePage(request));
