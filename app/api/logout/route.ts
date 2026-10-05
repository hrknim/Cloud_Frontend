import { proxyAuthRequest } from "@/lib/server/auth-proxy";

export const runtime = "nodejs";

export const POST = (request: Request) => proxyAuthRequest(request, "/api/logout");
