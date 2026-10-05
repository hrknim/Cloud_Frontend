// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function proxy(request: NextRequest) {
  const start = Date.now();
  const pathname = request.nextUrl.pathname.replace(/^\/s\/[^/]+$/, "/s/[token]").replace(/^\/api\/public\/files\/[^/]+/, "/api/public/files/[token]");

  const response = NextResponse.next();
  try {
    const duration = Date.now() - start;

    const logData = {
      // 접속자 기본 정보
      timestamp: start,
      ip: request.headers.get("x-forwarded-for"),
      userAgent: request.headers.get("user-agent") || "unknown",
      countryCode: '',

      // 요청 정보
      statusCode: response.status,
      method: request.method,
      path: pathname,
      //payload: (request.method == 'POST') ? await request.clone().json() : null,

      // 텔레메트리 및 통계 분석
      responseTime: duration,
      referer: request.headers.get('referer'),
      language: request.headers.get('accept-language')?.split(',')[0],
      //cookie: request.headers.get('cookie'), // 세션 정보 등
    };

    console.log(`${logData.statusCode == 200 ? '✅' : '❌'} ${logData.statusCode}: ${logData.path} [${logData.ip}]`)
  } catch (e) {
    console.log(e)
  }
  return response;
}

// 중요: 미들웨어가 실행될 경로를 지정합니다.
export const config = {
  matcher: [
    // 모든 경로에서 실행하되, 정적 파일이나 이미지 등은 제외합니다.
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
