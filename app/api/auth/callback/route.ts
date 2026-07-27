import { NextResponse, type NextRequest } from "next/server"

import {
  SESSION_COOKIE,
  createSessionValue,
  getLoginClient,
  isAllowedEmail,
} from "@/lib/auth"
import { getCallbackUrl, getPublicOrigin } from "@/lib/origin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** id_token(JWT) 의 payload 를 읽는다. 구글 토큰 엔드포인트에서 TLS 로 직접 받은 값이라 서명 재검증은 하지 않는다. */
function readIdTokenEmail(idToken: string): string | null {
  const payload = idToken.split(".")[1]
  if (!payload) return null

  try {
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"))
    const claims = JSON.parse(json) as {
      email?: string
      email_verified?: boolean | string
    }
    // 구글이 소유를 확인하지 못한 주소는 신뢰하지 않는다.
    const verified =
      claims.email_verified === true || claims.email_verified === "true"
    return verified ? (claims.email ?? null) : null
  } catch {
    return null
  }
}

function deny(origin: string, reason: string) {
  return NextResponse.redirect(`${origin}/?error=${encodeURIComponent(reason)}`)
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const origin = getPublicOrigin(request)

  if (url.searchParams.get("error")) {
    return deny(origin, "로그인이 취소되었습니다.")
  }

  const code = url.searchParams.get("code")
  if (!code) return deny(origin, "인증 코드가 없습니다.")

  // CSRF: 로그인 시작 때 심어둔 state 와 일치해야 한다.
  const state = url.searchParams.get("state")
  const savedState = request.cookies.get("oauth_state")?.value
  if (!state || !savedState || state !== savedState) {
    return deny(origin, "요청이 올바르지 않습니다. 다시 시도해 주세요.")
  }

  let clientId: string
  let clientSecret: string
  try {
    ;({ clientId, clientSecret } = getLoginClient())
  } catch (error) {
    return deny(origin, error instanceof Error ? error.message : "설정 오류")
  }

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: getCallbackUrl(request),
      grant_type: "authorization_code",
    }),
  })

  const token = (await tokenResponse.json().catch(() => null)) as {
    id_token?: string
    error_description?: string
  } | null

  if (!tokenResponse.ok || !token?.id_token) {
    // client_id 는 비밀값이 아니므로, 어느 클라이언트로 시도했는지 함께 보여준다.
    // ID 와 시크릿의 짝이 어긋난 경우를 바로 알아채기 위함이다.
    const reason = token?.error_description ?? "토큰 교환에 실패했습니다."
    return deny(
      origin,
      `${reason} (사용한 클라이언트: ${clientId.split("-")[0]}-${clientId.split("-")[1]?.slice(0, 6)}…)`
    )
  }

  const email = readIdTokenEmail(token.id_token)
  if (!email) return deny(origin, "이메일을 확인할 수 없습니다.")

  if (!isAllowedEmail(email)) {
    return deny(origin, `${email} 계정은 접근 권한이 없습니다.`)
  }

  const { value, maxAge } = await createSessionValue(email)
  const response = NextResponse.redirect(origin)
  response.cookies.set(SESSION_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: origin.startsWith("https://"),
    path: "/",
    maxAge,
  })
  response.cookies.delete("oauth_state")
  return response
}
