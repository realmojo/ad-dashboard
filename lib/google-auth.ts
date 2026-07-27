const TOKEN_URI = "https://oauth2.googleapis.com/token"

export class GoogleAuthError extends Error {
  status: number
  body?: unknown

  constructor(message: string, status: number, body?: unknown) {
    super(message)
    this.name = "GoogleAuthError"
    this.status = status
    this.body = body
  }
}

export interface OAuthClient {
  clientId: string
  clientSecret: string
}

/**
 * OAuth 클라이언트 자격증명.
 *
 * Cloudflare Workers 에는 파일시스템이 없으므로 환경변수만 사용한다.
 * 값은 Google Cloud Console 에서 받은 client_secret*.json 의
 * installed.client_id / installed.client_secret 이다.
 */
export function loadOAuthClient(): OAuthClient {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim()
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim()

  const missing = [
    !clientId && "GOOGLE_OAUTH_CLIENT_ID",
    !clientSecret && "GOOGLE_OAUTH_CLIENT_SECRET",
  ].filter(Boolean)

  if (missing.length > 0) {
    throw new GoogleAuthError(
      `구글 OAuth 환경변수가 없습니다: ${missing.join(", ")}. client_secret*.json 의 client_id / client_secret 을 넣어 주세요.`,
      500
    )
  }

  return { clientId: clientId!, clientSecret: clientSecret! }
}

let cachedToken: { value: string; expiresAt: number } | null = null

/**
 * refresh token 으로 access token 을 발급받는다. 만료 1분 전까지 재사용.
 * 애드센스와 GA4 가 같은 토큰(같은 동의)에 묶여 있어 한 곳에서 관리한다.
 */
export async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value
  }

  const refreshToken = process.env.ADSENSE_REFRESH_TOKEN
  if (!refreshToken) {
    throw new GoogleAuthError(
      "ADSENSE_REFRESH_TOKEN 이 없습니다. `npm run adsense:auth` 로 최초 인증을 진행하세요.",
      500
    )
  }

  const { clientId, clientSecret } = loadOAuthClient()
  const response = await fetch(TOKEN_URI, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  })

  const body = (await response.json()) as {
    access_token?: string
    expires_in?: number
    error_description?: string
    error?: string
  }

  if (!response.ok || !body.access_token) {
    // 어느 단계에서 막혔는지 알 수 있게 사유를 그대로 노출한다.
    const reason = [body.error, body.error_description]
      .filter(Boolean)
      .join(": ")
    throw new GoogleAuthError(
      `구글 토큰 발급 실패 (HTTP ${response.status}${reason ? ` · ${reason}` : ""}). ` +
        "GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET 가 " +
        "ADSENSE_REFRESH_TOKEN 을 발급한 클라이언트와 같은지 확인하세요.",
      response.status,
      body
    )
  }

  cachedToken = {
    value: body.access_token,
    expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
  }
  return cachedToken.value
}
