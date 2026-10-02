import { cloudResponse, deleteCloudItem, getCloudItem, updateCloudItem } from "@/lib/cloud";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export const GET = (request: Request, { params }: Context) => cloudResponse(async () => getCloudItem(request, (await params).id, "FILE"));
export const PATCH = (request: Request, { params }: Context) => cloudResponse(async () => updateCloudItem(request, (await params).id, "FILE"));
export const DELETE = (request: Request, { params }: Context) => cloudResponse(async () => deleteCloudItem(request, (await params).id, "FILE"));
