/**
 * 카카오 키워드광고 최초 1회 인증 스크립트.
 *
 *   npm run kakao:auth
 *
 * 브라우저에서 비즈니스 동의를 마치면 비즈니스 토큰을 받아
 * .env 에 KAKAO_ACCESS_TOKEN (있으면 KAKAO_REFRESH_TOKEN) 으로 저장한다.
 */
import { createServer } from "node:http"
import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { spawn } from "node:child_process"

const ROOT = process.cwd()
const PORT = 5813
const REDIRECT_URI = `http://localhost:${PORT}`

/** 조회만 하면 되므로 관리 권한 하나면 충분하다. */
const SCOPE = "keyword_management"

const ENV_PATH = join(ROOT, ".env")

function readEnv() {
  if (!existsSync(ENV_PATH)) return {}
  const env = {}
  for (const line of readFileSync(ENV_PATH, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "")
  }
  return env
}

function setEnv(updates) {
  let text = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, "utf8") : ""
  for (const [key, value] of Object.entries(updates)) {
    const line = `${key}=${value}`
    text = new RegExp(`^${key}=.*$`, "m").test(text)
      ? text.replace(new RegExp(`^${key}=.*$`, "m"), line)
      : `${text.replace(/\n*$/, "")}\n${line}\n`
  }
  writeFileSync(ENV_PATH, text)
}

const env = readEnv()
const clientId = env.KAKAO_REST_API_KEY
const clientSecret = env.KAKAO_CLIENT_SECRET

if (!clientId) {
  console.error("KAKAO_REST_API_KEY 가 .env 에 없습니다.")
  console.error(
    "  카카오 디벨로퍼스 > 내 애플리케이션 > 앱 키 > REST API 키 를 넣어 주세요."
  )
  process.exit(1)
}

const consentUrl =
  "https://kauth.kakao.com/oauth/business/authorize?" +
  new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: SCOPE,
  }).toString()

console.log(
  "\n아래 주소가 브라우저에서 열립니다. 열리지 않으면 직접 붙여넣으세요:\n"
)
console.log(consentUrl)
console.log(`\n리디렉션 URI 로 ${REDIRECT_URI} 가 등록되어 있어야 합니다.`)
console.log("  → 카카오 디벨로퍼스 > 카카오 로그인 > Redirect URI\n")

const server = createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT_URI)
  const code = url.searchParams.get("code")
  const error = url.searchParams.get("error")

  res.setHeader("Content-Type", "text/html; charset=utf-8")

  if (error) {
    const detail = url.searchParams.get("error_description") ?? ""
    res.end(`<h1>인증 실패</h1><p>${error} ${detail}</p>`)
    console.error("인증 실패:", error, detail)
    server.close()
    process.exit(1)
  }

  if (!code) {
    res.end("<p>code 파라미터가 없습니다.</p>")
    return
  }

  try {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      code,
      redirect_uri: REDIRECT_URI,
    })
    if (clientSecret) body.set("client_secret", clientSecret)

    const tokenRes = await fetch(
      "https://kauth.kakao.com/oauth/business/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
        },
        body,
      }
    )
    const token = await tokenRes.json()

    if (!tokenRes.ok || !token.access_token) {
      res.end(
        `<h1>토큰 교환 실패</h1><pre>${JSON.stringify(token, null, 2)}</pre>`
      )
      console.error("토큰 교환 실패:", token)
      server.close()
      process.exit(1)
    }

    const updates = { KAKAO_ACCESS_TOKEN: token.access_token }
    if (token.refresh_token) updates.KAKAO_REFRESH_TOKEN = token.refresh_token
    setEnv(updates)

    res.end(
      "<h1>인증 완료</h1><p>.env 에 토큰을 저장했습니다. 이 창은 닫아도 됩니다.</p>"
    )

    console.log("\n인증 완료. .env 에 저장했습니다.")
    // 유효기간·갱신 방식이 문서에 없어 실제 응답으로 확인해 알려준다.
    console.log("  access_token  : 저장됨")
    console.log(
      `  refresh_token : ${token.refresh_token ? "있음 (자동 갱신 가능)" : "없음 (만료 시 재인증 필요)"}`
    )
    if (token.expires_in) {
      const days = Math.round(token.expires_in / 86400)
      console.log(`  만료          : ${token.expires_in}초 (약 ${days}일)`)
    }
    if (token.refresh_token_expires_in) {
      const days = Math.round(token.refresh_token_expires_in / 86400)
      console.log(`  refresh 만료  : 약 ${days}일`)
    }
    console.log("\n응답 전체 키:", Object.keys(token).join(", "))

    server.close()
    process.exit(0)
  } catch (e) {
    res.end(`<h1>오류</h1><pre>${String(e)}</pre>`)
    console.error(e)
    server.close()
    process.exit(1)
  }
})

server.listen(PORT, () => {
  console.log(`콜백 대기 중: ${REDIRECT_URI}`)
  const opener =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "start"
        : "xdg-open"
  spawn(opener, [consentUrl], { stdio: "ignore", detached: true }).unref()
})
