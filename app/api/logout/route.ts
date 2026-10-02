import { proxyAuthRequest } from "@/lib/auth-proxy";

export const runtime = "nodejs";

export const POST = (request: Request) => proxyAuthRequest(request, "/api/logout");
