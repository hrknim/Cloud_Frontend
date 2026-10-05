import { cloudResponse, deleteCloudItem, getCloudItem, updateCloudItem } from "@/lib/server/cloud";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export const GET = (request: Request, { params }: Context) => cloudResponse(async () => getCloudItem(request, (await params).id, "FOLDER"));
export const PATCH = (request: Request, { params }: Context) => cloudResponse(async () => updateCloudItem(request, (await params).id, "FOLDER"));
export const DELETE = (request: Request, { params }: Context) => cloudResponse(async () => deleteCloudItem(request, (await params).id, "FOLDER"));
