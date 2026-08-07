/**
 * 검색광고 캠페인의 광고그룹·키워드를 구글 스프레드시트로 내보낸다.
 *
 *   npm run sheet:keywords                 시트에 바로 쓴다
 *   npm run sheet:keywords -- --dry-run    쓰지 않고 TSV 파일만 만든다
 *
 * 열: 광고그룹 · 키워드 · 노출수(PC) · 노출수(MO) · 중요도 · 입찰가 ·
 *     노출순위 · 현재상태 · 링크
 *
 * 중요도는 PC+MO 합에 따라 색이 다른 별표 하나다.
 *
 * 노출수는 keywordegg 가 주는 월간 검색량이다. 검색광고 API 의 노출수가
 * 아니다. 그쪽은 PC/모바일을 나눠 주는 기간이 최근 7일까지로 막혀 있다.
 */
import { createHmac } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

const ROOT = process.cwd()

const SPREADSHEET_ID = "10oqWEhCPq6RYl4Qc5Dl6ha0VpSzeJrgtm423KXJpeUA"
const SHEET_GID = 1934910271
const HEADER = [
  "광고그룹",
  "키워드",
  "노출수(PC)",
  "노출수(MO)",
  "중요도",
  "입찰가",
  "노출순위",
  "현재상태",
  "링크",
]
const LAST_COLUMN = "I"
// 노출순위를 뽑을 기간. 오늘까지 며칠치를 평균낼지.
const RANK_DAYS = 7
const STAT_CHUNK = 100
// 중요도 열(E)의 별표 색. PC+MO 합이 어느 구간에 드는지로 고른다.
const STAR_TIERS = [
  { min: 50000, color: "#1aa34a", label: "5만 이상" },
  { min: 10000, color: "#2b6cff", label: "1만 이상" },
  { min: 5000, color: "#f57c00", label: "5천 이상" },
  { min: 100, color: "#e6b800", label: "100 이상" },
  { min: 0, color: "#e04040", label: "100 미만" },
]
const STAR = "★"

const NAVER_BASE = "https://api.searchad.naver.com"
const EGG_BASE = "https://keywordegg.com/keywordegg/getSingleKeyword"

// keywordegg 는 내가 만든 API 지만 1,000건 넘게 두드리므로 동시 수를 묶어 둔다.
const EGG_CONCURRENCY = 5
const EGG_RETRY = 2
// 한 번 받아 둔 검색량은 재실행 때 다시 묻지 않는다.
const CACHE_PATH = join(ROOT, ".cache", "keyword-volume.json")
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000

const args = process.argv.slice(2)
const DRY_RUN = args.includes("--dry-run")
const FORCE = args.includes("--force")
// 계정에는 캠페인T · 캠페인_원페이지 · 캠페인S 가 있다. 시트는 캠페인T 만 받는다.
const CAMPAIGN =
  args.find((a) => a.startsWith("--campaign="))?.slice("--campaign=".length) ??
  "캠페인T"

/* ── .env ─────────────────────────────────────────────────────────── */

function loadEnv() {
  const path = join(ROOT, ".env")
  if (!existsSync(path)) return
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
    if (eq < 0) continue
    const key = trimmed.slice(0, eq).trim()
    if (process.env[key] !== undefined) continue
    process.env[key] = trimmed
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, "")
  }
}

loadEnv()

function required(name) {
  const value = process.env[name]?.trim()
  if (!value) {
    console.error(`.env 에 ${name} 이 없습니다.`)
    process.exit(1)
  }
  return value
}

/* ── 검색광고 API ─────────────────────────────────────────────────── */

const NAVER = {
  key: required("NAVER_ACCESS_LICENSE"),
  secret: required("NAVER_SECRET_KEY"),
  customer: required("NAVER_CUSTOMER_ID"),
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 초당 요청 수 제한에 걸리지 않게 한 줄로 세워 120ms 씩 띄운다.
let naverGate = Promise.resolve()

async function naver(path, search) {
  const turn = naverGate.then(() => sleep(120))
  naverGate = turn
  await turn

  const timestamp = Date.now().toString()
  const signature = createHmac("sha256", NAVER.secret)
    .update(`${timestamp}.GET.${path}`)
    .digest("base64")

  const url = `${NAVER_BASE}${path}${search ? `?${search}` : ""}`
  const response = await fetch(url, {
    headers: {
      "X-Timestamp": timestamp,
      "X-API-KEY": NAVER.key,
      "X-CUSTOMER": NAVER.customer,
      "X-Signature": signature,
    },
  })

  if (!response.ok) {
    throw new Error(
      `${path} → HTTP ${response.status} ${await response.text()}`
    )
  }
  return response.json()
}

/**
 * 키워드의 노출 상태를 한 마디로. 화면(components/status-text.tsx)과 같은 기준이다.
 */
function keywordState(keyword) {
  if (keyword.userLock) return "중지"

  switch (keyword.inspectStatus) {
    case "UNDER_REVIEW":
      return "검토중"
    case "PENDING":
      return "검토 대기"
    case "REJECTED":
      return "검수 거절"
    default:
      break
  }

  if (keyword.status === "ELIGIBLE") return "노출중"

  switch (keyword.statusReason) {
    case "KEYWORD_PAUSED":
      return "중지"
    case "KEYWORD_DISAPPROVED":
      return "검수 미승인"
    default:
      return keyword.statusReason ?? "노출 불가"
  }
}

/** 한국 날짜 기준 n일 전. "2026-08-07" 꼴. */
function seoulDate(daysAgo = 0) {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000)
  now.setUTCDate(now.getUTCDate() - daysAgo)
  return now.toISOString().slice(0, 10)
}

/**
 * 키워드별 평균 노출순위(avgRnk).
 *
 * 광고가 검색결과에서 몇 번째에 떴는지의 평균이라 1.0 에 가까울수록 위다.
 * 그날그날 다르므로 최근 며칠을 묶어 본다. 노출이 아예 없었으면 값이 없다.
 */
async function fetchRanks(ids) {
  const since = seoulDate(RANK_DAYS - 1)
  const until = seoulDate(0)
  const ranks = new Map()

  for (let i = 0; i < ids.length; i += STAT_CHUNK) {
    const chunk = ids.slice(i, i + STAT_CHUNK)
    const search = new URLSearchParams()
    for (const id of chunk) search.append("ids", id)
    search.set("fields", JSON.stringify(["avgRnk", "impCnt"]))
    search.set("timeRange", JSON.stringify({ since, until }))

    const body = await naver("/stats", search.toString())
    for (const row of body.data ?? []) {
      // 노출이 없으면 순위도 의미가 없다.
      if (row.impCnt > 0 && row.avgRnk > 0) ranks.set(row.id, row.avgRnk)
    }
  }

  console.log(
    `노출순위: ${since} ~ ${until} · ${ranks.size}/${ids.length}개에 값이 있음`
  )
  return ranks
}

/* ── keywordegg 검색량 ────────────────────────────────────────────── */

function loadCache() {
  if (FORCE || !existsSync(CACHE_PATH)) return {}
  try {
    const parsed = JSON.parse(readFileSync(CACHE_PATH, "utf8"))
    const fresh = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (Date.now() - (value?.at ?? 0) < CACHE_TTL_MS) fresh[key] = value
    }
    return fresh
  } catch {
    return {}
  }
}

function saveCache(cache) {
  mkdirSync(dirname(CACHE_PATH), { recursive: true })
  writeFileSync(CACHE_PATH, JSON.stringify(cache))
}

async function fetchVolume(keyword) {
  for (let attempt = 0; attempt <= EGG_RETRY; attempt += 1) {
    try {
      const response = await fetch(
        `${EGG_BASE}?keyword=${encodeURIComponent(keyword)}`,
        { signal: AbortSignal.timeout(20_000) }
      )
      if (!response.ok) throw new Error(`HTTP ${response.status}`)

      const body = await response.json()
      if (body.status !== "ok" || !body.item) throw new Error("item 없음")

      return { pc: body.item.pc ?? 0, mobile: body.item.mobile ?? 0 }
    } catch (error) {
      if (attempt === EGG_RETRY) {
        console.warn(`  검색량 실패: ${keyword} (${error.message})`)
        return null
      }
      await sleep(400 * (attempt + 1))
    }
  }
  return null
}

/** 동시 EGG_CONCURRENCY 개씩 훑는다. */
async function fetchAllVolumes(keywords) {
  const cache = loadCache()
  const todo = keywords.filter((k) => !cache[k])

  console.log(
    `검색량: 총 ${keywords.length}개 · 캐시 ${keywords.length - todo.length}개 · 조회 ${todo.length}개`
  )

  let done = 0
  let cursor = 0

  async function worker() {
    while (cursor < todo.length) {
      const keyword = todo[cursor++]
      const volume = await fetchVolume(keyword)
      if (volume) cache[keyword] = { ...volume, at: Date.now() }

      done += 1
      if (done % 100 === 0 || done === todo.length) {
        console.log(`  ${done}/${todo.length}`)
        saveCache(cache)
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(EGG_CONCURRENCY, todo.length) }, worker)
  )
  saveCache(cache)
  return cache
}

/* ── 구글 스프레드시트 ────────────────────────────────────────────── */

async function googleToken() {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: required("GOOGLE_OAUTH_CLIENT_ID"),
      client_secret: required("GOOGLE_OAUTH_CLIENT_SECRET"),
      refresh_token: required("ADSENSE_REFRESH_TOKEN"),
      grant_type: "refresh_token",
    }),
  })

  const body = await response.json()
  if (!body.access_token) {
    console.error(
      `구글 토큰 발급 실패: ${body.error_description ?? body.error}`
    )
    process.exit(1)
  }

  const scopes = (body.scope ?? "").split(" ")
  if (!scopes.includes("https://www.googleapis.com/auth/spreadsheets")) {
    console.error(
      "\n지금 토큰에는 스프레드시트 권한이 없습니다.\n" +
        "  npm run adsense:auth\n" +
        "를 한 번 더 실행해 동의를 마친 뒤 다시 시도하세요.\n" +
        `  현재 스코프: ${scopes.join(", ")}`
    )
    process.exit(1)
  }

  return body.access_token
}

function starTier(total) {
  return STAR_TIERS.find((tier) => total >= tier.min) ?? STAR_TIERS.at(-1)
}

/** "#1aa34a" → 시트가 받는 0~1 사이의 rgb. */
function rgbColor(hex) {
  const value = parseInt(hex.slice(1), 16)
  return {
    red: ((value >> 16) & 255) / 255,
    green: ((value >> 8) & 255) / 255,
    blue: (value & 255) / 255,
  }
}

async function sheets(token, path, init = {}) {
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}${path}`,
    {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
    }
  )

  const body = await response.json()
  if (!response.ok) {
    throw new Error(
      `시트 API ${path} → HTTP ${response.status} ${body?.error?.message ?? ""}`
    )
  }
  return body
}

/* ── 실행 ─────────────────────────────────────────────────────────── */

async function main() {
  const all = await naver("/ncc/campaigns")
  const campaigns = all.filter((c) => c.name.trim() === CAMPAIGN)

  if (campaigns.length === 0) {
    console.error(
      `"${CAMPAIGN}" 캠페인을 찾지 못했습니다. 있는 캠페인: ` +
        all.map((c) => c.name).join(", ")
    )
    process.exit(1)
  }

  const rows = []
  const keywordSet = new Set()

  for (const campaign of campaigns) {
    const adgroups = await naver(
      "/ncc/adgroups",
      `nccCampaignId=${campaign.nccCampaignId}`
    )
    console.log(`${campaign.name}: 광고그룹 ${adgroups.length}개`)

    for (const [index, adgroup] of adgroups.entries()) {
      const [keywords, ads] = await Promise.all([
        naver("/ncc/keywords", `nccAdgroupId=${adgroup.nccAdgroupId}`),
        naver("/ncc/ads", `nccAdgroupId=${adgroup.nccAdgroupId}`),
      ])

      // 소재의 랜딩 주소. 그룹 안에서는 대개 하나로 같다.
      const link =
        ads.find((a) => a.ad?.pc?.final || a.ad?.mobile?.final)?.ad?.pc
          ?.final ??
        ads.find((a) => a.ad?.mobile?.final)?.ad?.mobile?.final ??
        ""

      for (const keyword of keywords) {
        keywordSet.add(keyword.keyword)
        rows.push({
          id: keyword.nccKeywordId,
          adgroup: adgroup.name,
          keyword: keyword.keyword,
          // 키워드마다 값을 따로 준 것도 있고 그룹 값을 물려받는 것도 있다.
          // 실제로 적용되는 쪽을 넣는다.
          bid: keyword.useGroupBidAmt ? adgroup.bidAmt : keyword.bidAmt,
          fromGroup: Boolean(keyword.useGroupBidAmt),
          state: keywordState(keyword),
          link,
        })
      }

      if ((index + 1) % 10 === 0 || index + 1 === adgroups.length) {
        console.log(`  광고그룹 ${index + 1}/${adgroups.length}`)
      }
    }
  }

  console.log(`키워드 ${rows.length}줄 (중복 없는 키워드 ${keywordSet.size}개)`)

  const ranks = await fetchRanks(rows.map((r) => r.id))
  const volumes = await fetchAllVolumes([...keywordSet])

  const tiers = []
  const values = rows.map((row) => {
    const volume = volumes[row.keyword]
    const tier = starTier((volume?.pc ?? 0) + (volume?.mobile ?? 0))
    tiers.push(tier)

    return [
      row.adgroup,
      row.keyword,
      volume ? volume.pc : "",
      volume ? volume.mobile : "",
      STAR,
      row.bid ?? "",
      ranks.get(row.id) ?? "",
      row.state,
      row.link,
    ]
  })

  const fromGroup = rows.filter((r) => r.fromGroup).length
  console.log(
    `입찰가: 키워드별 ${rows.length - fromGroup}줄 · 그룹값 물려받음 ${fromGroup}줄`
  )

  const spread = new Map()
  for (const tier of tiers)
    spread.set(tier.label, (spread.get(tier.label) ?? 0) + 1)
  console.log("중요도:")
  for (const tier of STAR_TIERS) {
    console.log(`  ${tier.label.padEnd(8)} ${spread.get(tier.label) ?? 0}줄`)
  }

  if (DRY_RUN) {
    const path = join(ROOT, "keywords.tsv")
    writeFileSync(
      path,
      [HEADER, ...values].map((r) => r.join("\t")).join("\n") + "\n"
    )
    console.log(`\n--dry-run: ${path} 에 ${values.length}줄을 썼습니다.`)
    return
  }

  const token = await googleToken()

  const meta = await sheets(token, "?fields=sheets(properties(sheetId,title))")
  const sheet = meta.sheets.find((s) => s.properties.sheetId === SHEET_GID)
  if (!sheet) {
    console.error(
      `gid=${SHEET_GID} 인 시트를 찾지 못했습니다. 있는 시트: ` +
        meta.sheets.map((s) => s.properties.title).join(", ")
    )
    process.exit(1)
  }

  const title = sheet.properties.title
  const quoted = `'${title.replace(/'/g, "''")}'`
  console.log(`\n시트: ${title} (gid=${SHEET_GID})`)

  await sheets(
    token,
    `/values/${encodeURIComponent(`${quoted}!A1:${LAST_COLUMN}`)}:clear`,
    { method: "POST", body: "{}" }
  )

  // 열이 늘어날 때마다 손으로 맞추지 않게 머리글도 여기서 쓴다.
  // 값만 쓰므로 머리글에 입혀 둔 서식은 그대로 남는다.
  await sheets(
    token,
    `/values/${encodeURIComponent(`${quoted}!A1`)}?valueInputOption=RAW`,
    { method: "PUT", body: JSON.stringify({ values: [HEADER, ...values] }) }
  )

  // 별표 색은 값이 아니라 서식이라 따로 입힌다.
  await sheets(token, ":batchUpdate", {
    method: "POST",
    body: JSON.stringify({
      requests: [
        {
          updateCells: {
            range: {
              sheetId: SHEET_GID,
              startRowIndex: 1,
              endRowIndex: 1 + tiers.length,
              startColumnIndex: 4, // E
              endColumnIndex: 5,
            },
            rows: tiers.map((tier) => ({
              values: [
                {
                  userEnteredFormat: {
                    horizontalAlignment: "CENTER",
                    textFormat: {
                      bold: true,
                      foregroundColorStyle: { rgbColor: rgbColor(tier.color) },
                    },
                  },
                },
              ],
            })),
            fields:
              "userEnteredFormat(horizontalAlignment,textFormat(bold,foregroundColorStyle))",
          },
        },
      ],
    }),
  })

  console.log(`${values.length}줄을 저장했습니다.`)
  console.log(
    `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit?gid=${SHEET_GID}`
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
