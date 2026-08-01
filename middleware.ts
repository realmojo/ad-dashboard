import { NextResponse, type NextRequest } from "next/server"

import { SESSION_COOKIE, verifySessionValue } from "@/lib/auth"
import { getPublicOrigin } from "@/lib/origin"

/**
 * 로그인하지 않은 접근을 막는다.
 * 메인 페이지(/)는 스스로 로그인 화면을 그리므로 통과시키고,
 * 데이터가 그대로 나가는 API 와 상세 페이지만 잠근다.
 */
export async function middleware(request: NextRequest) {
  const session = await verifySessionValue(
    request.cookies.get(SESSION_COOKIE)?.value
  )
  if (session) return NextResponse.next()

  const { pathname } = new URL(request.url)

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 })
  }
  return NextResponse.redirect(getPublicOrigin(request))
}

export const config = {
  matcher: [
    "/powerlink/:path*",
    "/naver-search/:path*",
    "/adsense/:path*",
    "/write/:path*",
    "/api/naver-ad/:path*",
    "/api/adsense/:path*",
    "/api/naver-search/:path*",
    // 실제 사이트에 글을 올리는 경로라 반드시 잠근다.
    "/api/write/:path*",
  ],
}
