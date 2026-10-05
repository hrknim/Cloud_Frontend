import { cloudResponse, getCloudOwnerProfile } from "@/lib/server/cloud";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return cloudResponse(() => getCloudOwnerProfile(request, id));
}
