import { proxyAuthRequest } from "@/lib/auth-proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = (request: Request) => proxyAuthRequest(request, "/api/user");
