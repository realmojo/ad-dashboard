import type { NextRequest } from "next/server"

/**
 * OAuth 리디렉션에 쓸 공개 origin.
 *
 * Cloudflare 같은 프록시 뒤에서는 request.url 의 스킴이 http 로 잡힐 수 있는데,
 * 구글은 등록된 redirect_uri 와 문자열이 정확히 일치해야 하므로 어긋나면 실패한다.
 * APP_ORIGIN > x-forwarded-* 헤더 > request.url 순으로 신뢰한다.
 */
export function getPublicOrigin(request: NextRequest): string {
  const configured = process.env.APP_ORIGIN?.trim()
  if (configured) return configured.replace(/\/+$/, "")

  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host")
  if (host) {
    const proto =
      request.headers.get("x-forwarded-proto") ??
      // 로컬 개발이 아니면 https 로 본다.
      (host.startsWith("localhost") || host.startsWith("127.0.0.1")
        ? "http"
        : "https")
    return `${proto}://${host}`
  }

  return new URL(request.url).origin
}

/** 구글에 등록해야 하는 콜백 주소. */
export function getCallbackUrl(request: NextRequest): string {
  return `${getPublicOrigin(request)}/api/auth/callback`
}
