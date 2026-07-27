/**
 * 로컬 .env 의 값을 Cloudflare Workers 시크릿으로 한 번에 올린다.
 *
 *   npm run cf:secrets
 *
 * 값을 화면에 찍지 않고 wrangler 에 그대로 넘긴다.
 * 임시 파일은 업로드 직후 지운다.
 */
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { join } from "node:path"

const ROOT = process.cwd()
const ENV_PATH = join(ROOT, ".env")

/** 배포에 필요한 키. 없으면 어디서 얻는지 알려준다. */
const REQUIRED = {
  NAVER_ACCESS_LICENSE: "네이버 검색광고 > 도구 > API 사용관리",
  NAVER_SECRET_KEY: "네이버 검색광고 > 도구 > API 사용관리",
  NAVER_CUSTOMER_ID: "네이버 검색광고 고객 ID (숫자)",
  GOOGLE_OAUTH_CLIENT_ID: "애드센스·GA4 조회용 (데스크톱 클라이언트)",
  GOOGLE_OAUTH_CLIENT_SECRET: "애드센스·GA4 조회용 (데스크톱 클라이언트)",
  ADSENSE_REFRESH_TOKEN: "npm run adsense:auth 로 발급",
  GA4_PROPERTY_ID: "GA4 속성 ID (숫자)",
  AUTH_SECRET: "세션 서명용 임의 문자열",
  GOOGLE_LOGIN_CLIENT_ID: "구글 로그인용 — 웹 애플리케이션 유형 클라이언트",
  GOOGLE_LOGIN_CLIENT_SECRET: "구글 로그인용 — 웹 애플리케이션 유형 클라이언트",
  ALLOWED_EMAILS: "로그인 허용 계정 (쉼표 구분)",
}

if (!existsSync(ENV_PATH)) {
  console.error(".env 파일이 없습니다.")
  process.exit(1)
}

const env = {}
for (const line of readFileSync(ENV_PATH, "utf8").split("\n")) {
  const match = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (match) env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "")
}

const missing = Object.keys(REQUIRED).filter((key) => !env[key])
if (missing.length > 0) {
  console.error("다음 값이 .env 에 없습니다:\n")
  for (const key of missing) console.error(`  ${key}\n    → ${REQUIRED[key]}`)
  console.error("\n.env 에 채운 뒤 다시 실행하세요.")
  process.exit(1)
}

const payload = Object.fromEntries(
  Object.keys(REQUIRED).map((key) => [key, env[key]])
)

const tmp = join(ROOT, ".cf-secrets.tmp.json")
writeFileSync(tmp, JSON.stringify(payload), { mode: 0o600 })

console.log(`시크릿 ${Object.keys(payload).length}개를 업로드합니다...`)
console.log(
  Object.keys(payload)
    .map((k) => `  - ${k}`)
    .join("\n")
)

try {
  const result = spawnSync("npx", ["wrangler", "secret", "bulk", tmp], {
    stdio: "inherit",
  })
  process.exitCode = result.status ?? 1
} finally {
  // 값이 담긴 임시 파일은 반드시 지운다.
  unlinkSync(tmp)
}
