import { NextResponse, type NextRequest } from "next/server"

import { getLoginClient } from "@/lib/auth"
import { getCallbackUrl, getPublicOrigin } from "@/lib/origin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** 구글 동의 화면으로 보낸다. */
export async function GET(request: NextRequest) {
  const origin = getPublicOrigin(request)

  let clientId: string
  try {
    clientId = getLoginClient().clientId
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "로그인 설정 오류" },
      { status: 500 }
    )
  }

  // CSRF 방지용 state. 쿠키에 담아두고 콜백에서 대조한다.
  const state = crypto.randomUUID()

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getCallbackUrl(request),
    response_type: "code",
    scope: "openid email profile",
    // 계정 선택 화면을 항상 띄워 다른 계정으로 바꾸기 쉽게 한다.
    prompt: "select_account",
    state,
  })

  const response = NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  )
  response.cookies.set("oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: origin.startsWith("https://"),
    path: "/",
    maxAge: 600,
  })
  return response
}
