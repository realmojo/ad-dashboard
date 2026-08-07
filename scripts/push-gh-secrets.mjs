/**
 * 로컬 .env 의 값을 GitHub Actions 시크릿으로 올린다.
 *
 *   npm run gh:secrets
 *
 * .github/workflows/sheet-keywords.yml (매시 시트 갱신) 이 쓰는 값만 올린다.
 * 값은 화면에 찍지 않고 gh 의 표준입력으로 넘긴다.
 */
import { existsSync, readFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { join } from "node:path"

const ENV_PATH = join(process.cwd(), ".env")

/** 워크플로가 env 로 넘기는 것과 같은 목록이어야 한다. */
const REQUIRED = [
  "NAVER_ACCESS_LICENSE",
  "NAVER_SECRET_KEY",
  "NAVER_CUSTOMER_ID",
  "GOOGLE_OAUTH_CLIENT_ID",
  "GOOGLE_OAUTH_CLIENT_SECRET",
  "ADSENSE_REFRESH_TOKEN",
]

if (!existsSync(ENV_PATH)) {
  console.error(".env 파일이 없습니다.")
  process.exit(1)
}

const env = {}
for (const line of readFileSync(ENV_PATH, "utf8").split("\n")) {
  const match = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (match) env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "")
}

const missing = REQUIRED.filter((key) => !env[key])
if (missing.length > 0) {
  console.error(`.env 에 없는 값: ${missing.join(", ")}`)
  process.exit(1)
}

const auth = spawnSync("gh", ["auth", "status"], { stdio: "ignore" })
if (auth.status !== 0) {
  console.error("gh 로그인이 필요합니다:\n\n  gh auth login\n")
  process.exit(1)
}

for (const key of REQUIRED) {
  const result = spawnSync("gh", ["secret", "set", key], {
    input: env[key],
    stdio: ["pipe", "inherit", "inherit"],
  })

  if (result.status !== 0) {
    console.error(`${key} 등록 실패`)
    process.exit(1)
  }
  console.log(`  ${key} 등록됨`)
}

console.log(
  `\n${REQUIRED.length}개를 올렸습니다.\n` +
    "  gh workflow run 'sheet-keywords.yml'   ← 지금 한 번 돌려보기"
)
