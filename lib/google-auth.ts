import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

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
  redirectUri: string
}

/**
 * Google Cloud Console 에서 받은 OAuth 클라이언트 JSON 을 읽는다.
 * GOOGLE_OAUTH_CLIENT_FILE 로 경로를 지정할 수 있고,
 * 없으면 프로젝트 루트의 client_secret*.json 을 찾는다.
 */
export function loadOAuthClient(): OAuthClient {
  const explicit = process.env.GOOGLE_OAUTH_CLIENT_FILE
  let path = explicit

  if (!path) {
    const root = process.cwd()
    const found = readdirSync(root).find(
      (name) => name.startsWith("client_secret") && name.endsWith(".json")
    )
    if (found) path = join(root, found)
  }

  if (!path) {
    throw new GoogleAuthError(
      "OAuth 클라이언트 JSON 을 찾을 수 없습니다. GOOGLE_OAUTH_CLIENT_FILE 을 설정하거나 프로젝트 루트에 client_secret*.json 을 두세요.",
      500
    )
  }

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"))
  } catch {
    throw new GoogleAuthError(
      `OAuth 클라이언트 JSON 을 읽지 못했습니다: ${path}`,
      500
    )
  }

  // 데스크톱 앱은 "installed", 웹 앱은 "web" 키 아래에 값이 들어있다.
  const config = (parsed.installed ?? parsed.web) as
    | { client_id?: string; client_secret?: string; redirect_uris?: string[] }
    | undefined

  if (!config?.client_id || !config.client_secret) {
    throw new GoogleAuthError(
      `OAuth 클라이언트 JSON 형식이 올바르지 않습니다: ${path}`,
      500
    )
  }

  return {
    clientId: config.client_id,
    clientSecret: config.client_secret,
    redirectUri: config.redirect_uris?.[0] ?? "http://localhost",
  }
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
    throw new GoogleAuthError(
      body.error_description ?? body.error ?? "access token 발급 실패",
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
