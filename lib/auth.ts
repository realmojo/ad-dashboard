/**
 * 구글 로그인 세션.
 *
 * 허용된 계정으로 로그인했을 때만 대시보드를 보여준다.
 * 세션은 HMAC 으로 서명한 쿠키 하나로 관리한다(외부 의존성 없음).
 * Web Crypto 만 쓰므로 Node 와 Cloudflare Workers 양쪽에서 동작한다.
 */

export const SESSION_COOKIE = "ad_dashboard_session"

/** 세션 유효 기간 (7일) */
const SESSION_MAX_AGE_SEC = 7 * 24 * 60 * 60

/** 로그인을 허용할 계정. 쉼표로 여러 개 지정할 수 있다. */
export function getAllowedEmails(): string[] {
  const raw = process.env.ALLOWED_EMAILS ?? "tedevspace@gmail.com"
  return raw
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
}

export function isAllowedEmail(email: string | undefined | null): boolean {
  if (!email) return false
  return getAllowedEmails().includes(email.toLowerCase())
}

/**
 * 로그인용 OAuth 클라이언트.
 * 배포 환경에서는 "웹 애플리케이션" 유형이어야 https 리디렉션이 가능하다.
 * 지정하지 않으면 애드센스/GA4 용 클라이언트를 그대로 쓴다(로컬 개발용).
 */
export function getLoginClient() {
  const clientId =
    process.env.GOOGLE_LOGIN_CLIENT_ID?.trim() ||
    process.env.GOOGLE_OAUTH_CLIENT_ID?.trim()
  const clientSecret =
    process.env.GOOGLE_LOGIN_CLIENT_SECRET?.trim() ||
    process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim()

  if (!clientId || !clientSecret) {
    throw new Error(
      "구글 로그인 클라이언트가 설정되지 않았습니다. GOOGLE_LOGIN_CLIENT_ID / GOOGLE_LOGIN_CLIENT_SECRET 을 확인하세요."
    )
  }
  return { clientId, clientSecret }
}

function getSecret(): string {
  const secret = process.env.AUTH_SECRET?.trim()
  if (!secret) {
    throw new Error(
      "AUTH_SECRET 이 없습니다. 세션 서명을 위해 임의의 긴 문자열을 넣어 주세요."
    )
  }
  return secret
}

const encoder = new TextEncoder()

async function hmac(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  )
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(payload)
  )
  // 쿠키에 넣을 수 있도록 URL-safe base64 로 바꾼다.
  return btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}

/** 길이가 달라도 조기 종료하지 않도록 상수 시간에 가깝게 비교한다. */
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export interface Session {
  email: string
  expiresAt: number
}

/** "email|만료시각|서명" 형태의 쿠키 값을 만든다. */
export async function createSessionValue(email: string): Promise<{
  value: string
  maxAge: number
}> {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SEC
  const payload = `${email}|${expiresAt}`
  const signature = await hmac(payload)
  return { value: `${payload}|${signature}`, maxAge: SESSION_MAX_AGE_SEC }
}

/** 쿠키 값을 검증한다. 서명·만료·허용계정 중 하나라도 어긋나면 null. */
export async function verifySessionValue(
  value: string | undefined
): Promise<Session | null> {
  if (!value) return null

  const parts = value.split("|")
  if (parts.length !== 3) return null

  const [email, expiresRaw, signature] = parts as [string, string, string]
  const expected = await hmac(`${email}|${expiresRaw}`)
  if (!safeEqual(signature, expected)) return null

  const expiresAt = Number(expiresRaw)
  if (!Number.isFinite(expiresAt) || expiresAt * 1000 < Date.now()) return null

  // 로그인 후 허용 목록에서 빠졌다면 즉시 무효로 본다.
  if (!isAllowedEmail(email)) return null

  return { email, expiresAt }
}
